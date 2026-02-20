import MessageBox from "sap/m/MessageBox";
import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import TreeTable from "sap/ui/table/TreeTable";

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
            console.error("OData v4 model niet gevonden.");
            return;
        }

        try {
            const hostname = window.location.hostname;
            const isLocal: boolean = hostname.includes("localhost") || hostname.includes("port") || hostname.includes("4004");
            const sPath = isLocal ? "/analyzeExport(...)" : "/analyzeFromDestination(...)";
            
            console.log(`Binding to path: ${sPath}`);

            const oBinding = oModel.bindContext(sPath);
            await oBinding.execute();

            const oContext = oBinding.getBoundContext();
            const result = oContext ? oContext.getObject() as any : null;

            const data = result?.value || result;
            
            // Add type filters
            data.typeFilters = [
                { key: "all", text: "All Types" },
                { key: "role", text: "Roles" },
                { key: "space", text: "Spaces" },
                { key: "page", text: "Pages" },
                { key: "app", text: "Apps" }
            ];
            
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

    public onSearch(oEvent: any): void {
        const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
        const oTable = this.byId("roleTree") as TreeTable;
        
        if (!oTable) return;

        if (sQuery && sQuery.length > 0) {
            // Expand all when searching
            oTable.expandToLevel(10);
            
            // Highlight matches
            this._highlightMatches(sQuery.toLowerCase());
        } else {
            // Clear highlights
            this._clearHighlights();
        }
    }

    private _highlightMatches(sQuery: string): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        if (!oModel) return;

        const aRoles = oModel.getProperty("/roles") || [];
        this._markMatchingNodes(aRoles, sQuery);
        oModel.refresh(true);
    }

    private _markMatchingNodes(aNodes: any[], sQuery: string): void {
        aNodes.forEach(node => {
            const bMatches = 
                (node.id && node.id.toLowerCase().includes(sQuery)) ||
                (node.title && node.title.toLowerCase().includes(sQuery)) ||
                (node.type && node.type.toLowerCase().includes(sQuery)) ||
                (node.providerId && node.providerId.toLowerCase().includes(sQuery));
            
            node.highlighted = bMatches;
            
            if (node.children && node.children.length > 0) {
                this._markMatchingNodes(node.children, sQuery);
            }
        });
    }

    private _clearHighlights(): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        if (!oModel) return;

        const aRoles = oModel.getProperty("/roles") || [];
        this._clearNodeHighlights(aRoles);
        oModel.refresh(true);
    }

    private _clearNodeHighlights(aNodes: any[]): void {
        aNodes.forEach(node => {
            node.highlighted = false;
            if (node.children && node.children.length > 0) {
                this._clearNodeHighlights(node.children);
            }
        });
    }

    public onTypeFilterChange(oEvent: any): void {
        const sSelectedKey = oEvent.getParameter("selectedItem").getKey();
        const oTable = this.byId("roleTree") as TreeTable;
        
        if (!oTable) return;

        if (sSelectedKey === "all") {
            oTable.collapseAll();
        } else {
            // Expand all and highlight matching type
            oTable.expandToLevel(10);
            this._highlightType(sSelectedKey);
        }
    }

    private _highlightType(sType: string): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        if (!oModel) return;

        const aRoles = oModel.getProperty("/roles") || [];
        this._markMatchingType(aRoles, sType);
        oModel.refresh(true);
    }

    private _markMatchingType(aNodes: any[], sType: string): void {
        aNodes.forEach(node => {
            node.highlighted = (node.type === sType);
            
            if (node.children && node.children.length > 0) {
                this._markMatchingType(node.children, sType);
            }
        });
    }

    public onExpandAll(): void {
        const oTable = this.byId("roleTree") as TreeTable;
        if (oTable) {
            oTable.expandToLevel(10);
        }
    }

    public onCollapseAll(): void {
        const oTable = this.byId("roleTree") as TreeTable;
        if (oTable) {
            oTable.collapseAll();
            this._clearHighlights();
        }
    }
}