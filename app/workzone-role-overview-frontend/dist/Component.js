import BaseComponent from "sap/ui/core/UIComponent";
import { createDeviceModel } from "./model/models";
/**
 * @namespace com.yteria.workzoneroleoverviewfrontend
 */
export default class Component extends BaseComponent {
    static metadata = {
        manifest: "json",
        interfaces: [
            "sap.ui.core.IAsyncContentCreation"
        ]
    };
    init() {
        // call the base component's init function
        super.init();
        // set the device model
        this.setModel(createDeviceModel(), "device");
        // enable routing
        this.getRouter().initialize();
    }
}
