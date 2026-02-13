import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
/**
 * @namespace com.yteria.workzoneroleoverviewfrontend.controller
 */
export default class overview extends Controller {
    onInit() {
        this._loadData();
    }
    async _loadData() {
        try {
            const isLocal = window.location.hostname === "localhost";
            let data;
            if (isLocal) {
                console.log("Running locally - using analyzeExport");
                data = await this._analyzeExport();
            }
            else {
                console.log("Running deployed - using destination");
                data = await this._analyzeFromDestination();
            }
            const oModel = new JSONModel(data);
            this.getView()?.setModel(oModel);
        }
        catch (error) {
            console.error("Error loading data:", error);
            MessageBox.error("Failed to load data: " + (error.message || "Unknown error"));
        }
    }
    async _analyzeExport() {
        const response = await fetch("/odata/v4/workzone/analyzeExport", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });
        if (!response.ok) {
            throw new Error("Analysis failed");
        }
        const result = await response.json();
        return result.value || result;
    }
    async _analyzeFromDestination() {
        const response = await fetch("/odata/v4/workzone/analyzeFromDestination", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });
        if (!response.ok) {
            throw new Error("Analysis from destination failed");
        }
        const result = await response.json();
        return result.value || result;
    }
}
