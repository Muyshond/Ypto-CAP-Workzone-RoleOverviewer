import { executeHttpRequest } from '@sap-cloud-sdk/http-client'; 


const workzone_api_destination = "workzone-api"; 

export default cds.service.impl(async function () {

    this.on('getWorkzoneData', async (req) => {
        try {

        const response = await executeHttpRequest(workzone_api_destination, {
                method: 'GET',
                url: `/cdm_export_service/v1/export/site(siteID='${req.data.siteId}')` 
            });
           
        return response.data;
        } catch (error) {
            req.error(500, "Error fetching workzone zip file for site" + req.data.siteId + error);
        }
    });


});