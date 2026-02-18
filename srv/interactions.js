const cds = require('@sap/cds');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

module.exports = cds.service.impl(async function() {
    
    this.on('analyzeExport', async (req) => {
        try {
            return {
                roles: [], 
                statistics: { 
                    totalRoles: 999, 
                    totalSpaces: 0, 
                    totalPages: 0, 
                    totalApps: 0 
                },
                message: "Verbinding succesvol! De backend heeft data ontvangen."
            };
            const zipPath = path.join(__dirname, '..', 'data', 'ContentTransport_20260203_121637.zip');
            
            if (!fs.existsSync(zipPath)) {
                req.error(404, `Zip file not found at ${zipPath}`);
                return;
            }
            
            const zipBuffer = fs.readFileSync(zipPath);
            
            const analyzer = new WorkzoneAnalyzer();
            const result = analyzer.analyzeFromBuffer(zipBuffer);
            
            return result;
        } catch (error) {
            console.error('Analysis error:', error);
            req.error(500, `Analysis failed: ${error.message}`);
        }
    });



    this.on('analyzeFromDestination', async (req) => {
        try {
 return {
                roles: [], 
                statistics: { 
                    totalRoles: 999, 
                    totalSpaces: 0, 
                    totalPages: 0, 
                    totalApps: 0 
                },
                message: "Verbinding succesvol! De backend heeft data ontvangen."
            };            const destination = await cds.connect.to('workzone-api');
            
            const response = await destination.get('/v1/export/site(siteID="1af031d9-9029-49a0-9ab5-f880ce5118bb")');
            
            const analyzer = new WorkzoneAnalyzer();
            const result = analyzer.analyzeFromBuffer(response);
            
            return result;
        } catch (error) {
            req.error(500, `Failed to fetch from destination: ${error.message}`);
        }
    });
});

// class WorkzoneAnalyzer {
//     constructor() {
//         this.data = {
//             spaces: [],
//             workpages: [],
//             relations_sp_wp: [],
//             relations_wp_vz: [],
//             business_apps: [],
//             roles: [],
//             metadata: {},
//             direct_role_relations: {}
//         };
//     }

//     analyzeFromBuffer(zipBuffer) {
//         const extractedData = this.extractZip(zipBuffer);
//         this.loadDataFromFiles(extractedData);
//         return this.generateUI5Hierarchy();
//     }

//     extractZip(zipBuffer) {
//         const zip = new AdmZip(zipBuffer);
//         const entries = zip.getEntries();
//         const files = {};

//         entries.forEach(entry => {
//             if (!entry.isDirectory && entry.entryName.endsWith('.json')) {
//                 const content = entry.getData().toString('utf8');
//                 files[entry.entryName] = JSON.parse(content);
//             }
//         });

//         // Handle nested zips
//         entries.forEach(entry => {
//             if (!entry.isDirectory && entry.entryName.endsWith('.zip')) {
//                 const nestedZip = new AdmZip(entry.getData());
//                 const nestedEntries = nestedZip.getEntries();
                
//                 nestedEntries.forEach(nestedEntry => {
//                     if (!nestedEntry.isDirectory && nestedEntry.entryName.endsWith('.json')) {
//                         const content = nestedEntry.getData().toString('utf8');
//                         files[`${entry.entryName}/${nestedEntry.entryName}`] = JSON.parse(content);
//                     }
//                 });
//             }
//         });

//         return files;
//     }

//     loadDataFromFiles(files) {
//         for (const [filename, content] of Object.entries(files)) {
//             if (filename.includes('export_data') || filename.includes('export_metadata')) {
//                 this.data.metadata = content;
//             } else if (filename.includes('1_DataFile_SP.json')) {
//                 this.data.spaces = content;
//             } else if (filename.includes('1_DataFile_WPV.json')) {
//                 this.data.workpages = content;
//             } else if (filename.includes('1_DataFile_SP-WP.json')) {
//                 this.data.relations_sp_wp = content;
//             } else if (filename.includes('1_DataFile_WP-VZ.json')) {
//                 this.data.relations_wp_vz = content;
//             } else if (filename.toLowerCase().includes('businessapp') && filename.endsWith('.json')) {
//                 if (Array.isArray(content)) {
//                     this.data.business_apps.push(...content);
//                 }
//             } else if (filename.toLowerCase().includes('role') && filename.endsWith('.json')) {
//                 if (filename.toLowerCase().includes('relations')) {
//                     if (content && content.id) {
//                         this.data.direct_role_relations[content.id] = content.relations || {};
//                     }
//                 } else if (Array.isArray(content)) {
//                     this.data.roles.push(...content);
//                 }
//             }
//         }
//     }

//     generateUI5Hierarchy() {
//         const wpVizMap = {};
//         this.data.workpages.forEach(wp => {
//             if (wp.language === 'en') {
//                 wpVizMap[wp.id] = wp.workPageVizsId || [];
//             }
//         });

//         const spWpMap = {};
//         const wpSpMap = {};
//         this.data.relations_sp_wp.forEach(rel => {
//             const spId = rel.spaceId;
//             const wpId = rel.workPageId;
//             if (!spWpMap[spId]) spWpMap[spId] = [];
//             spWpMap[spId].push(wpId);
//             wpSpMap[wpId] = spId;
//         });

//         const spaceDetails = {};
//         this.data.spaces.forEach(sp => {
//             if (!['master', 'en'].includes(sp.language)) return;
            
//             const spId = sp.id;
//             const spaceNode = {
//                 id: spId,
//                 type: 'space',
//                 title: sp.mergedEntity?.value?.title || sp.descriptor?.value?.title || 'Unknown Space',
//                 pageCount: 0,
//                 appCount: 0,
//                 children: []
//             };

//             const wpIds = spWpMap[spId] || [];
//             wpIds.forEach(wpId => {
//                 const wpDetails = this.data.workpages.find(w => w.id === wpId && w.language === 'en');
//                 if (!wpDetails) return;
                
//                 const vizIds = wpVizMap[wpId] || [];
//                 const cleanedVizIds = vizIds.map(vid => vid.split('#')[0]);

//                 const pageNode = {
//                     id: wpId,
//                     type: 'page',
//                     title: wpDetails.mergedEntity?.descriptor?.value?.title || wpId,
//                     appCount: cleanedVizIds.length,
//                     children: []
//                 };

//                 cleanedVizIds.forEach(appId => {
//                     pageNode.children.push({
//                         id: appId,
//                         type: 'app',
//                         title: appId.includes('_') ? appId.split('_').pop() : appId,
//                         fullId: appId
//                     });
//                 });

//                 spaceNode.children.push(pageNode);
//                 spaceNode.pageCount++;
//                 spaceNode.appCount += cleanedVizIds.length;
//             });
            
//             spaceDetails[spId] = spaceNode;
//         });

//         const rolesHierarchy = [];
        
//         this.data.roles.forEach(role => {
//             const roleId = role.cdm?.identification?.id;
//             const providerId = role.cdm?.identification?.providerId;
            
//             const roleApps = [];
//             const roleSpaces = {};
//             let totalApps = 0;

//             this.data.business_apps.forEach(app => {
//                 const appId = app.cdm?.identification?.id;
//                 const appRelations = app.cdm?.relations?.roles || [];
                
//                 if (appRelations.some(r => r.target?.id === roleId)) {
//                     roleApps.push(appId);
//                 }
//             });

//             if (this.data.direct_role_relations[roleId]) {
//                 const directRels = this.data.direct_role_relations[roleId];
//                 const spaceIds = directRels.space || [];
                
//                 const businessapps = directRels.businessapp || [];
//                 businessapps.forEach(aId => {
//                     if (!roleApps.includes(aId)) {
//                         roleApps.push(aId);
//                     }
//                 });
                
//                 spaceIds.forEach(spaceId => {
//                     if (spaceDetails[spaceId]) {
//                         roleSpaces[spaceId] = JSON.parse(JSON.stringify(spaceDetails[spaceId]));
//                         totalApps += roleSpaces[spaceId].appCount || 0;
//                     }
//                 });
//             }

//             if (providerId) {
//                 this.data.workpages.forEach(wp => {
//                     if (wp.language !== 'en') return;
                    
//                     const wpId = wp.id;
//                     const wpTitle = wp.mergedEntity?.descriptor?.value?.title;
//                     const vizIds = wp.workPageVizsId || [];
                    
//                     const matchedApps = [];
//                     vizIds.forEach(vizId => {
//                         if (vizId.startsWith(providerId + '_') || vizId.includes(providerId)) {
//                             matchedApps.push(vizId.split('#')[0]);
//                         }
//                     });
                    
//                     if (matchedApps.length > 0) {
//                         const spaceId = wpSpMap[wpId];
//                         if (spaceId && spaceDetails[spaceId]) {
//                             if (!roleSpaces[spaceId]) {
//                                 roleSpaces[spaceId] = {
//                                     id: spaceId,
//                                     type: 'space',
//                                     title: spaceDetails[spaceId].title,
//                                     pageCount: 0,
//                                     appCount: 0,
//                                     children: []
//                                 };
//                             }
                            
//                             const pageNode = {
//                                 id: wpId,
//                                 type: 'page',
//                                 title: wpTitle,
//                                 appCount: matchedApps.length,
//                                 children: []
//                             };
                            
//                             matchedApps.forEach(appId => {
//                                 pageNode.children.push({
//                                     id: appId,
//                                     type: 'app',
//                                     title: appId.includes('_') ? appId.split('_').pop() : appId,
//                                     fullId: appId
//                                 });
//                                 totalApps++;
//                             });
                            
//                             roleSpaces[spaceId].children.push(pageNode);
//                             roleSpaces[spaceId].pageCount++;
//                             roleSpaces[spaceId].appCount += matchedApps.length;
//                         }
//                     }
//                 });
//             }

//             const roleNode = {
//                 id: roleId,
//                 type: 'role',
//                 title: roleId.includes('_') ? roleId.split('_').pop() : roleId,
//                 fullId: roleId,
//                 providerId: providerId || 'BTP',
//                 spaceCount: Object.keys(roleSpaces).length,
//                 totalPages: Object.values(roleSpaces).reduce((sum, s) => sum + (s.pageCount || 0), 0),
//                 totalApps: totalApps + roleApps.length,
//                 children: []
//             };
            
//             Object.values(roleSpaces).forEach(space => {
//                 roleNode.children.push(space);
//             });
            
//             roleApps.forEach(appId => {
//                 roleNode.children.push({
//                     id: appId,
//                     type: 'app',
//                     title: appId.includes('_') ? appId.split('_').pop() : appId,
//                     fullId: appId
//                 });
//             });
            
//             rolesHierarchy.push(roleNode);
//         });

//         return {
//             roles: rolesHierarchy,
//             statistics: {
//                 totalRoles: this.data.roles.length,
//                 totalSpaces: this.data.spaces.filter(s => ['master', 'en'].includes(s.language)).length,
//                 totalPages: this.data.workpages.filter(w => w.language === 'en').length,
//                 totalApps: this.data.business_apps.length
//             }
//         };
//     }
// }