const cds = require('@sap/cds');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const { getDestination } = require('@sap-cloud-sdk/connectivity');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

// ─────────────────────────────────────────────────────────────────────────────
//  PROVIDER → DESTINATION MAPPING
//
//  Design Time destinations gebruiken = zelfde als Workzone bij content sync.
//  Uit jouw Channel Manager:
//    S4      → Design Time: "s4dt"   Runtime: "s4"
//    GBX     → Design Time: "GBXdt"  Runtime: "gbx"
//    S4_TMP  → zelfde systeem als S4, dus ook "s4dt"
//
//  be.nmbs.* zijn Content Package channels → geen extern CDM endpoint.
// ─────────────────────────────────────────────────────────────────────────────
const PROVIDER_DESTINATIONS = {
    'S4':     { destination: 's4dt',  cdmPath: '/sap/bc/ui2/cdm3/entities' },
    'GBX':    { destination: 'GBxdt', cdmPath: '' },
    'S4_TMP': { destination: 's4dt',  cdmPath: '/sap/bc/ui2/cdm3/entities' },
};

// Workzone voegt een prefix toe aan externe role IDs.
// Formule: "~" + providerID.toLowerCase() + "_"
//   GBX    → ~gbx_
//   S4     → ~s4_
//   S4_TMP → ~s4_tmp_
function wzPrefix(providerId) {
    return `~${providerId.toLowerCase()}_`;
}


module.exports = cds.service.impl(async function () {

    // ── Lokale zip (offline / localhost) ─────────────────────────────────────
    this.on('analyzeExport', async (req) => {
        try {
            const zipPath = path.join(__dirname, '..', 'data', 'ContentTransport.zip');
            if (!fs.existsSync(zipPath)) { req.error(404, `Zip niet gevonden: ${zipPath}`); return; }
            return new WorkzoneAnalyzer().analyzeFromBuffer(fs.readFileSync(zipPath), {});
        } catch (err) {
            console.error('analyzeExport fout:', err);
            req.error(500, `Analyse mislukt: ${err.message}`);
        }
    });

    // ── Live Workzone data via destination + siteId ───────────────────────────
    this.on('getWorkzoneData', async (req) => {
        const { env, siteId } = req.data;
        if (!env || !siteId) { req.error(400, 'env en siteId zijn verplicht.'); return; }

        try {
            console.log(`\n=== Workzone ophalen: env="${env}", siteId="${siteId}" ===`);
            const workzoneDest = await getDestination({ destinationName: `workzone-api-${env}` });

            // ── Stap 1: Workzone zip export ───────────────────────────────────
            console.log('Stap 1: zip export ophalen...');
            const zipResp = await executeHttpRequest(workzoneDest, {
                method: 'GET',
                url: `/cdm_export_service/v1/export/site(siteID='${siteId}')`,
                responseType: 'arraybuffer'
            });
            const zipBuffer = Buffer.from(zipResp.data);
            console.log(`  ✓ ${(zipBuffer.length / 1024).toFixed(0)} KB`);

            // ── Stap 2: S4HANA CDM — rollen + apps voor GBX / S4 / S4_TMP ────
            // S4HANA geeft rollen terug zonder prefix (bv. "S4D_BCGN_MDGA_REQXX").
            // Workzone slaat ze op MET prefix (bv. "~gbx_S4D_BCGN_MDGA_REQXX").
            // parseCdmRoles voegt de prefix toe zodat de IDs matchen.
            console.log('Stap 2: S4HANA CDM ophalen voor backend rollen + app-titels...');
            const providerRoleMap = await fetchAllProviderRoles();

            return new WorkzoneAnalyzer().analyzeFromBuffer(zipBuffer, providerRoleMap);

        } catch (err) {
            console.error('getWorkzoneData fout:', err.message);
            req.error(500, `Workzone data laden mislukt: ${err.message}`);
        }
    });
});


// ─────────────────────────────────────────────────────────────────────────────
//  Haal voor elke geconfigureerde provider alle rollen op.
//  Providers met dezelfde destination worden gegroepeerd (bv. S4 + S4_TMP →
//  één HTTP-call naar s4dt).
//
//  Noot: S4 CDM geeft app-titels terug via texts[].textDictionary.title.
//  identification.title is altijd "{{title}}" — de echte naam zit in texts[].
// ─────────────────────────────────────────────────────────────────────────────
async function fetchAllProviderRoles() {
    const roleMap = {};

    // Groepeer providers per destination om dubbele calls te vermijden
    const destGroups = {};
    for (const [providerId, cfg] of Object.entries(PROVIDER_DESTINATIONS)) {
        (destGroups[cfg.destination] ??= { cfg, providers: [] }).providers.push(providerId);
    }

    await Promise.allSettled(
        Object.entries(destGroups).map(async ([destName, { cfg, providers }]) => {
            try {
                console.log(`  → Destination "${destName}"  (providers: ${providers.join(', ')})`);
                const dest = await getDestination({ destinationName: destName });

                // Roles en businessapps parallel ophalen
                const [rolesResp, appsResp] = await Promise.all([
                    executeHttpRequest(dest, {
                        method: 'GET',
                        url: cfg.cdmPath,
                        params: { entityType: 'role' },
                        headers: { 'Accept': 'application/json' }
                    }),
                    executeHttpRequest(dest, {
                        method: 'GET',
                        url: cfg.cdmPath,
                        params: { entityType: 'businessapp' },
                        headers: { 'Accept': 'application/json' }
                    }).catch(() => null)
                ]);

                // App-titel map opbouwen uit texts[] — identification.title is altijd {{title}}
                // maar texts[].textDictionary.title bevat de echte vertaalde naam.
                const appTitleMap = {};
                if (appsResp) {
                    const appEntities = normalizeCdmEntities(appsResp.data);
                    for (const e of appEntities) {
                        const id = e?.identification?.id;
                        if (!id) continue;
                        const title = resolveTextsTitle(e?.texts);
                        if (title) appTitleMap[id] = title;
                    }
                    console.log(`    ✓ ${Object.keys(appTitleMap).length} app-titels opgehaald`);
                }

                for (const providerId of providers) {
                    const roles = parseCdmRoles(rolesResp.data, providerId, appTitleMap);
                    roles.forEach(r => { roleMap[r.wzId] = r; });
                    console.log(`    ✓ ${roles.length} rollen voor ${providerId}  (prefix: "${wzPrefix(providerId)}")`);
                }

            } catch (err) {
                console.warn(`    ✗ ${destName} mislukt: ${err.message}`);
            }
        })
    );

    console.log(`  Totaal in roleMap: ${Object.keys(roleMap).length}`);
    return roleMap;
}

// Normaliseer CDM response naar array van entiteiten
function normalizeCdmEntities(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.d?.results))
        return data.d.results.map(r => typeof r.cdm_json === 'string' ? JSON.parse(r.cdm_json) : r);
    if (Array.isArray(data?.value)) return data.value;
    return [];
}

// Lees de echte titel uit texts[] — prefereer 'en', dan '' (default), dan eerste entry
function resolveTextsTitle(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return null;
    const preferred = texts.find(t => t.locale === 'en')
                   || texts.find(t => t.locale === '')
                   || texts[0];
    const title = preferred?.textDictionary?.title;
    return (title && !title.startsWith('{{')) ? title : null;
}


// ─────────────────────────────────────────────────────────────────────────────
//  Parseert S4HANA CDM response en berekent het Workzone-compatible ID.
//
//  S4HANA geeft:  { identification: { id: "S4D_BCGN_MDGA_REQXX" } }
//  Workzone wil:  "~gbx_S4D_BCGN_MDGA_REQXX"  (= wzPrefix(provider) + s4Id)
//
//  Ondersteunde response formaten:
//    • CDM v3 array  →  [ { identification, payload, texts }, ... ]
//    • OData v2      →  { d: { results: [ { cdm_json: "..." }, ... ] } }
//    • OData v4      →  { value: [...] }
// ─────────────────────────────────────────────────────────────────────────────
function parseCdmRoles(data, providerId, appTitleMap = {}) {
    const prefix = wzPrefix(providerId);

    const entities = normalizeCdmEntities(data);

    return entities
        .filter(e => {
            const type = e?.identification?.entityType || e?.cdm?.identification?.entityType;
            return type === 'role';
        })
        .map(e => {
            const ident  = e?.identification  || e?.cdm?.identification  || {};
            const payload = e?.payload        || e?.cdm?.payload         || {};
            const texts   = e?.texts          || e?.cdm?.texts           || {};

            const s4RoleId  = ident.id || '';
            const rawTitle  = texts['cdm|identification|title']?.value?.[''] || ident.title || '';
            const roleTitle = (rawTitle && !rawTitle.startsWith('{{')) ? rawTitle : s4RoleId;

            // Apps in payload.apps of payload.viz — filter generic systeem-apps eruit
            // App-titels worden opgezocht in appTitleMap (gebouwd uit businessapp texts[])
            const GENERIC_APP_PREFIXES = ['businessapp.flp.', 'businessapp.gui.', 'businessapp.wda.'];
            const rawApps = payload.apps || payload.viz || [];
            const apps = rawApps
                .map(a => {
                    const id = a?.id || a?.vizId || String(a);
                    const title = appTitleMap[id] || (a?.title?.startsWith('{{') ? null : a?.title) || null;
                    return { id, title };
                })
                .filter(a => a.id && !GENERIC_APP_PREFIXES.some(p => a.id.startsWith(p)));

            return {
                s4Id:       s4RoleId,               // origineel S4HANA ID
                wzId:       prefix + s4RoleId,      // Workzone ID (met prefix)
                providerId,
                title:      roleTitle,
                apps
            };
        })
        .filter(r => r.s4Id);
}


// ─────────────────────────────────────────────────────────────────────────────
class WorkzoneAnalyzer {

    constructor() {
        this.data = {
            spaces: [], workpages: [], relations_sp_wp: [],
            business_apps: [], roles: [], metadata: {},
            direct_role_relations: {}
        };
    }

    analyzeFromBuffer(zipBuffer, providerRoleMap) {
        this.loadDataFromFiles(this.extractZip(zipBuffer));
        return this.generateUI5Hierarchy(providerRoleMap);
    }

    extractZip(zipBuffer) {
        const zip = new AdmZip(zipBuffer);
        const files = {};

        zip.getEntries().forEach(entry => {
            if (!entry.isDirectory && entry.entryName.endsWith('.json')) {
                try { files[entry.entryName] = JSON.parse(entry.getData().toString('utf8')); }
                catch { /* skip */ }
            }
        });

        // Geneste content.zip (CEP runtime agent)
        zip.getEntries().forEach(entry => {
            if (!entry.isDirectory && entry.entryName.endsWith('.zip')) {
                try {
                    new AdmZip(entry.getData()).getEntries().forEach(nested => {
                        if (!nested.isDirectory && nested.entryName.endsWith('.json')) {
                            try {
                                files[`${entry.entryName}/${nested.entryName}`] =
                                    JSON.parse(nested.getData().toString('utf8'));
                            } catch { /* skip */ }
                        }
                    });
                } catch { /* skip */ }
            }
        });

        return files;
    }

    loadDataFromFiles(files) {
        for (const [name, content] of Object.entries(files)) {
            if (name.includes('export_data') || name.includes('export_metadata')) {
                this.data.metadata = content;
            } else if (name.includes('1_DataFile_SP.json')) {
                this.data.spaces = content;
            } else if (name.includes('1_DataFile_WPV.json')) {
                this.data.workpages = content;
            } else if (name.includes('1_DataFile_SP-WP.json')) {
                this.data.relations_sp_wp = content;
            } else if (name.toLowerCase().includes('businessapp') && name.endsWith('.json')) {
                if (Array.isArray(content)) this.data.business_apps.push(...content);
            } else if (name.toLowerCase().includes('role') && name.endsWith('.json')) {
                if (name.toLowerCase().includes('relations')) {
                    if (content?.id) this.data.direct_role_relations[content.id] = content.relations || {};
                } else if (Array.isArray(content)) {
                    this.data.roles.push(...content);
                }
            }
        }
    }

    generateUI5Hierarchy(providerRoleMap) {

        // Workpage → viz IDs
        const wpVizMap = {};
        this.data.workpages.forEach(wp => {
            if (wp.language === 'en') wpVizMap[wp.id] = wp.workPageVizsId || [];
        });

        // Space → workpages
        const spWpMap = {};
        this.data.relations_sp_wp.forEach(rel => {
            (spWpMap[rel.spaceId] ??= []).push(rel.workPageId);
        });

        // Space detail cache
        const spaceDetails = {};
        this.data.spaces.forEach(sp => {
            if (!['master', 'en'].includes(sp.language)) return;

            const spaceNode = {
                id: sp.id, type: 'space',
                title: sp.mergedEntity?.value?.title || sp.descriptor?.value?.title || sp.id,
                pageCount: 0, appCount: 0, children: []
            };

            (spWpMap[sp.id] || []).forEach(wpId => {
                const wp = this.data.workpages.find(w => w.id === wpId && w.language === 'en');
                if (!wp) return;

                const vizIds = (wpVizMap[wpId] || []).map(v => v.split('#')[0]);
                const pageNode = {
                    id: wpId, type: 'page',
                    title: wp.mergedEntity?.descriptor?.value?.title || wpId,
                    appCount: vizIds.length, children: []
                };

                vizIds.forEach(appId => pageNode.children.push({
                    id: appId, type: 'app',
                    title: this._friendlyName(appId), fullId: appId
                }));

                spaceNode.children.push(pageNode);
                spaceNode.pageCount++;
                spaceNode.appCount += vizIds.length;
            });

            spaceDetails[sp.id] = spaceNode;
        });

        // ── Rollen samenstellen ───────────────────────────────────────────────
        const rolesHierarchy = [];
        let enriched = 0, notEnriched = 0;

        this.data.roles.forEach(role => {
            const roleId     = role.cdm?.identification?.id;
            const providerId = role.cdm?.identification?.providerId;
            if (!roleId) return;

            const isBackend = !!(role.cdm?.relations?.base?.length);
            const children  = [];
            let totalApps   = 0;

            if (!isBackend) {
                // ── Lokale rollen: data uit de zip ────────────────────────────
                const rels = this.data.direct_role_relations[roleId] || {};

                (rels.space || []).forEach(spId => {
                    const sp = spaceDetails[spId];
                    if (sp) { children.push(JSON.parse(JSON.stringify(sp))); totalApps += sp.appCount; }
                });

                const appIds = new Set([
                    ...(rels.businessapp || []),
                    ...this.data.business_apps
                        .filter(a => (a.cdm?.relations?.roles || []).some(r => r.target?.id === roleId))
                        .map(a => a.cdm?.identification?.id)
                        .filter(Boolean)
                ]);
                appIds.forEach(appId => {
                    children.push({ id: appId, type: 'app', title: this._friendlyName(appId), fullId: appId });
                    totalApps++;
                });

            } else {
                // ── Backend rollen: data uit S4HANA CDM ───────────────────────
                // roleId = "~gbx_S4D_BCGN_MDGA_REQXX"
                // providerRoleMap heeft sleutel "~gbx_S4D_BCGN_MDGA_REQXX" (wzId)
                const pData = providerRoleMap[roleId];

                if (pData?.apps?.length) {
                    enriched++;
                    pData.apps.forEach(app => {
                        children.push({
                            id: app.id, type: 'app',
                            title: app.title || app.id,
                            fullId: app.id
                        });
                        totalApps++;
                    });
                } else {
                    notEnriched++;
                    // Content Package channel (be.nmbs.*) of destination niet bereikbaar
                }
            }

            const roleTitle =
                role.cdm?.texts?.['cdm|identification|title']?.value?.[''] ||
                providerRoleMap[roleId]?.title ||
                this._friendlyName(roleId);

            rolesHierarchy.push({
                id: roleId, type: 'role',
                title: roleTitle, fullId: roleId,
                providerId: providerId || 'BTP',
                isBackendRole: isBackend,
                hasProviderData: isBackend ? !!(providerRoleMap[roleId]?.apps?.length) : true,
                spaceCount: children.filter(c => c.type === 'space').length,
                totalPages:  children.filter(c => c.type === 'space')
                                     .reduce((s, sp) => s + (sp.pageCount || 0), 0),
                totalApps,
                children
            });
        });

        if (enriched + notEnriched > 0) {
            console.log(`Backend rollen: ${enriched} met apps van S4HANA, ${notEnriched} zonder (Content Package of onbereikbaar)`);
        }

        return {
            roles: rolesHierarchy,
            statistics: {
                totalRoles:      rolesHierarchy.length,
                totalSpaces:     Object.keys(spaceDetails).length,
                totalPages:      this.data.workpages.filter(w => w.language === 'en').length,
                totalApps:       rolesHierarchy.reduce((s, r) => s + (r.totalApps || 0), 0),
                backendEnriched: enriched,
                backendEmpty:    notEnriched
            }
        };
    }

    _friendlyName(id) {
        if (!id) return '';
        if (id.includes('#')) return id.split('#').pop();
        if (id.startsWith('~')) {
            // "~gbx_S4D_FIOA_VIMC_XXXXX" → "S4D_FIOA_VIMC_XXXXX"
            const parts = id.slice(1).split('_');
            return parts.slice(1).join('_');
        }
        if (id.includes('_')) return id.split('_').pop();
        return id;
    }
}