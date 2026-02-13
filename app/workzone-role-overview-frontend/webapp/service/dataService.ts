// /model/MyService.ts
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataParentBinding from "sap/ui/model/odata/v4/ODataParentBinding";

export default class dataService {
    
    

   static async getWorkzoneData(id: string, oView: any) {
    try {
        const oModel = oView?.getModel() as sap.ui.model.odata.v4.ODataModel;
        
        const oBinding = oModel.bindContext("/getWorkzoneData(...)", undefined, {});

        oBinding.setParameter("siteId", id);

        await oBinding.execute();

        const oContext = oBinding.getBoundContext();
        if (oContext) {
            return oContext.getObject().value; 
        }

    } catch (error) {
        console.error("Error fetching workzone data:", error);
        throw error; 
    }
}





}