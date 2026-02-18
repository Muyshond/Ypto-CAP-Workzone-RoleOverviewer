import MessageBox from "sap/m/MessageBox";
import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";

/**
 * @namespace be.nmbs.overviewworkzone.controller
 */
export default class overview extends Controller {

    public onInit(): void {
        this.getView()?.addEventDelegate({
            onBeforeShow: () => {
                this._loadData();
            }
        });
    }

    private async _loadData(): Promise<void> {
        const oView = this.getView();
        if (!oView) return;

        const oModel = (oView.getModel() || this.getOwnerComponent()?.getModel()) as ODataModel;

        if (!oModel) {
            console.error("OData v4 model 'mainService' niet gevonden.");
            return;
        }

        try {
            const hostname =  window.location.hostname;
            var isLocal: boolean = hostname.includes("localhost" ) || hostname.includes("port") || hostname.includes("4004");
            //isLocal = true
            const sPath = isLocal ? "/analyzeExport(...)" : "/analyzeFromDestination(...)";
            
            console.log(`Binding to path: ${sPath}`);

            const oBinding = oModel.bindContext(sPath);

            await oBinding.execute();

            const oContext = oBinding.getBoundContext();
            const result = oContext ? oContext.getObject() as any : null;

            const data = result?.value || result;
            const oModelData = new JSONModel(data);
            
            this.getView()?.setModel(oModelData);
            
            console.log("Data succesvol geladen");

        } catch (error: any) {
            console.error("Fout tijdens laden:", error);
            if (!error.canceled) {
                MessageBox.error("Data ophalen mislukt: " + (error.message || "Server Error"));
            }
        }
    }
}