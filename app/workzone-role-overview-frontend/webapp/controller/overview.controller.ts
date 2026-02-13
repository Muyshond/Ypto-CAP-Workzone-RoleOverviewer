import Controller from "sap/ui/core/mvc/Controller";
import dataService from "../service/dataService";

/**
 * @namespace com.yteria.workzoneroleoverviewfrontend.controller
 */
export default class overview extends Controller {

    /*eslint-disable @typescript-eslint/no-empty-function*/
    public onInit(): void {
        this.collectData();
    }

    public async collectData(): Promise<void> {
        console.log("Collecting data...");
        
        try {

            dataService.getWorkzoneData("test", this.getView())
        } catch (error) {
            console.error("Error loading data:", error);
        }
    }

}