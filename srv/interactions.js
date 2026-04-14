const cds = require('@sap/cds');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const { getDestination } = require('@sap-cloud-sdk/connectivity');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

module.exports = cds.service.impl(async function () {
    //const WORKZONE_SITE_ID = '1af031d9-9029-49a0-9ab5-f880ce5118bb';
    //workzone-api 

    // ── Local zip (offline / localhost) ───────────────────────────────────────
    this.on('analyzeExport', async (req) => {
        try {
            const zipPath = path.join(__dirname, '..', 'data', 'ContentTransport.zip');

            if (!fs.existsSync(zipPath)) {
                req.error(404, `Zip file not found at ${zipPath}`);
                return;
            }

            const zipBuffer = fs.readFileSync(zipPath);
            return new WorkzoneAnalyzer().analyzeFromBuffer(zipBuffer);

        } catch (error) {
            console.error('analyzeExport error:', error);
            req.error(500, `Analysis failed: ${error.message}`);
        }
    });

    // ── Live Workzone data via destination + siteId ───────────────────────────
    this.on('getWorkzoneData', async (req) => {
        const { env, siteId } = req.data;

        if (!env || !siteId) {
            req.error(400, 'Both env (destination name) and siteId are required.');
            return;
        }

        try {
            console.log(`Fetching Workzone data — destination: "${env}", siteId: "${siteId}"`);
            const destination = "workzone-api-" + env;

            const dest = await getDestination({ destinationName: destination });
    
            const response = await executeHttpRequest(dest, {
                method: 'GET',
                url: `/cdm_export_service/v1/export/site(siteID='${siteId}')`,
                responseType: 'arraybuffer'
            });

            const zipBuffer = Buffer.from(response.data);
            return new WorkzoneAnalyzer().analyzeFromBuffer(zipBuffer);

        } catch (error) {
            console.error('getWorkzoneData error:', error.message);
            const message = error.response?.data
                ? `API Error: ${error.response.statusText}`
                : error.message;
            req.error(500, `Failed to load Workzone data: ${message}`);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────

class WorkzoneAnalyzer {
    constructor() {
        this.data = {
            spaces: [],
            workpages: [],
            relations_sp_wp: [],
            relations_wp_vz: [],
            business_apps: [],
            roles: [],
            metadata: {},
            direct_role_relations: {}
        };
    }

    analyzeFromBuffer(zipBuffer) {
        const extractedData = this.extractZip(zipBuffer);
        this.loadDataFromFiles(extractedData);
        return this.generateUI5Hierarchy();
    }

    extractZip(zipBuffer) {
        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();
        const files = {};

        entries.forEach(entry => {
            if (!entry.isDirectory && entry.entryName.endsWith('.json')) {
                files[entry.entryName] = JSON.parse(entry.getData().toString('utf8'));
            }
        });

        entries.forEach(entry => {
            if (!entry.isDirectory && entry.entryName.endsWith('.zip')) {
                const nestedZip = new AdmZip(entry.getData());
                nestedZip.getEntries().forEach(nestedEntry => {
                    if (!nestedEntry.isDirectory && nestedEntry.entryName.endsWith('.json')) {
                        files[`${entry.entryName}/${nestedEntry.entryName}`] =
                            JSON.parse(nestedEntry.getData().toString('utf8'));
                    }
                });
            }
        });

        return files;
    }

    loadDataFromFiles(files) {
        for (const [filename, content] of Object.entries(files)) {
            if (filename.includes('export_data') || filename.includes('export_metadata')) {
                this.data.metadata = content;
            } else if (filename.includes('1_DataFile_SP.json')) {
                this.data.spaces = content;
            } else if (filename.includes('1_DataFile_WPV.json')) {
                this.data.workpages = content;
            } else if (filename.includes('1_DataFile_SP-WP.json')) {
                this.data.relations_sp_wp = content;
            } else if (filename.includes('1_DataFile_WP-VZ.json')) {
                this.data.relations_wp_vz = content;
            } else if (filename.toLowerCase().includes('businessapp') && filename.endsWith('.json')) {
                if (Array.isArray(content)) this.data.business_apps.push(...content);
            } else if (filename.toLowerCase().includes('role') && filename.endsWith('.json')) {
                if (filename.toLowerCase().includes('relations')) {
                    if (content && content.id) {
                        this.data.direct_role_relations[content.id] = content.relations || {};
                    }
                } else if (Array.isArray(content)) {
                    this.data.roles.push(...content);
                }
            }
        }
    }

    generateUI5Hierarchy() {
        const wpVizMap = {};
        this.data.workpages.forEach(wp => {
            if (wp.language === 'en') wpVizMap[wp.id] = wp.workPageVizsId || [];
        });

        const spWpMap = {};
        const wpSpMap = {};
        this.data.relations_sp_wp.forEach(rel => {
            if (!spWpMap[rel.spaceId]) spWpMap[rel.spaceId] = [];
            spWpMap[rel.spaceId].push(rel.workPageId);
            wpSpMap[rel.workPageId] = rel.spaceId;
        });

        const spaceDetails = {};
        this.data.spaces.forEach(sp => {
            if (!['master', 'en'].includes(sp.language)) return;

            const spaceNode = {
                id: sp.id, type: 'space',
                title: sp.mergedEntity?.value?.title || sp.descriptor?.value?.title || 'Unknown Space',
                pageCount: 0, appCount: 0, children: []
            };

            (spWpMap[sp.id] || []).forEach(wpId => {
                const wpDetails = this.data.workpages.find(w => w.id === wpId && w.language === 'en');
                if (!wpDetails) return;

                const cleanedVizIds = (wpVizMap[wpId] || []).map(vid => vid.split('#')[0]);
                const pageNode = {
                    id: wpId, type: 'page',
                    title: wpDetails.mergedEntity?.descriptor?.value?.title || wpId,
                    appCount: cleanedVizIds.length, children: []
                };

                cleanedVizIds.forEach(appId => pageNode.children.push({
                    id: appId, type: 'app',
                    title: appId.includes('_') ? appId.split('_').pop() : appId,
                    fullId: appId
                }));

                spaceNode.children.push(pageNode);
                spaceNode.pageCount++;
                spaceNode.appCount += cleanedVizIds.length;
            });

            spaceDetails[sp.id] = spaceNode;
        });

        const rolesHierarchy = [];

        this.data.roles.forEach(role => {
            const roleId    = role.cdm?.identification?.id;
            const providerId = role.cdm?.identification?.providerId;

            const roleApps  = [];
            const roleSpaces = {};
            let totalApps   = 0;

            this.data.business_apps.forEach(app => {
                const appId = app.cdm?.identification?.id;
                if ((app.cdm?.relations?.roles || []).some(r => r.target?.id === roleId)) {
                    roleApps.push(appId);
                }
            });

            if (this.data.direct_role_relations[roleId]) {
                const directRels = this.data.direct_role_relations[roleId];
                (directRels.businessapp || []).forEach(aId => { if (!roleApps.includes(aId)) roleApps.push(aId); });
                (directRels.space || []).forEach(spaceId => {
                    if (spaceDetails[spaceId]) {
                        roleSpaces[spaceId] = JSON.parse(JSON.stringify(spaceDetails[spaceId]));
                        totalApps += roleSpaces[spaceId].appCount || 0;
                    }
                });
            }

            const roleNode = {
                id: roleId, type: 'role',
                title: roleId.includes('_') ? roleId.split('_').pop() : roleId,
                fullId: roleId,
                providerId: providerId || 'BTP',
                spaceCount: Object.keys(roleSpaces).length,
                totalPages: Object.values(roleSpaces).reduce((sum, s) => sum + (s.pageCount || 0), 0),
                totalApps: totalApps + roleApps.length,
                children: []
            };

            Object.values(roleSpaces).forEach(space => roleNode.children.push(space));
            roleApps.forEach(appId => roleNode.children.push({
                id: appId, type: 'app',
                title: appId.includes('_') ? appId.split('_').pop() : appId,
                fullId: appId
            }));

            rolesHierarchy.push(roleNode);
        });

        return {
            roles: rolesHierarchy,
            statistics: {
                totalRoles:  this.data.roles.length,
                totalSpaces: this.data.spaces.filter(s => ['master', 'en'].includes(s.language)).length,
                totalPages:  this.data.workpages.filter(w => w.language === 'en').length,
                totalApps:   this.data.business_apps.length
            }
        };
    }
}