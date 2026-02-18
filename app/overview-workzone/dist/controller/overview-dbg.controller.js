sap.ui.define(["sap/m/MessageBox", "sap/ui/core/mvc/Controller", "sap/ui/model/json/JSONModel"], function (MessageBox, Controller, JSONModel) {
  "use strict";

  /**
   * @namespace be.nmbs.overviewworkzone.controller
   */
  const overview = Controller.extend("be.nmbs.overviewworkzone.controller.overview", {
    onInit: function _onInit() {
      this.getView()?.addEventDelegate({
        onBeforeShow: () => {
          this._loadData();
        }
      });
    },
    _loadData: async function _loadData() {
      const oView = this.getView();
      if (!oView) return;
      const oModel = oView.getModel() || this.getOwnerComponent()?.getModel();
      if (!oModel) {
        console.error("OData v4 model 'mainService' niet gevonden.");
        return;
      }
      try {
        const hostname = window.location.hostname;
        var isLocal = hostname.includes("localhost") || hostname.includes("port") || hostname.includes("4004");
        //isLocal = true
        const sPath = isLocal ? "/analyzeExport(...)" : "/analyzeFromDestination(...)";
        console.log(`Binding to path: ${sPath}`);
        const oBinding = oModel.bindContext(sPath);
        await oBinding.execute();
        const oContext = oBinding.getBoundContext();
        const result = oContext ? oContext.getObject() : null;
        const data = result?.value || result;
        const oModelData = new JSONModel(data);
        this.getView()?.setModel(oModelData);
        console.log("Data succesvol geladen");
      } catch (error) {
        console.error("Fout tijdens laden:", error);
        if (!error.canceled) {
          MessageBox.error("Data ophalen mislukt: " + (error.message || "Server Error"));
        }
      }
    }
  });
  return overview;
});
//# sourceMappingURL=overview-dbg.controller.js.map
