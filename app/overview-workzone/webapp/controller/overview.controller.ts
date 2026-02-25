import MessageBox from "sap/m/MessageBox";
import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import TreeTable from "sap/ui/table/TreeTable";

/**
 * @namespace be.nmbs.overviewworkzone.controller
 */
export default class overview extends Controller {

    private _sCurrentQuery: string = "";
    private _aOriginalRoles: any[] = [];

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

            data.typeFilters = [
                { key: "all", text: "All Types" },
                { key: "role", text: "Roles" },
                { key: "space", text: "Spaces" },
                { key: "page", text: "Pages" },
                { key: "app", text: "Apps" }
            ];

            data._searchQuery = "";

            this._aOriginalRoles = JSON.parse(JSON.stringify(data.roles || []));

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
        const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").trim();
        this._sCurrentQuery = sQuery.toLowerCase();

        const oTable = this.byId("roleTree") as TreeTable;
        const oModel = this.getView()?.getModel() as JSONModel;
        if (!oTable || !oModel) return;

        if (this._sCurrentQuery.length > 0) {
            const aFiltered = this._filterTree(
                JSON.parse(JSON.stringify(this._aOriginalRoles)),
                this._sCurrentQuery,
                false 
            );
            oModel.setProperty("/roles", aFiltered);
            oModel.setProperty("/_searchQuery", this._sCurrentQuery);
            oModel.refresh(true);
            oTable.expandToLevel(10);
        } else {
            oModel.setProperty("/roles", JSON.parse(JSON.stringify(this._aOriginalRoles)));
            oModel.setProperty("/_searchQuery", "");
            oModel.refresh(true);
            oTable.collapseAll();
        }
    }


    private _filterTree(aNodes: any[], sQuery: string, bAncestorMatched: boolean): any[] {
        const aResult: any[] = [];

        for (const node of aNodes) {
            if (bAncestorMatched) {
                const oKept = { ...node };
                oKept.highlighted = this._nodeMatches(node, sQuery);
                if (node.children && node.children.length > 0) {
                    oKept.children = this._filterTree(node.children, sQuery, true);
                }
                aResult.push(oKept);
                continue;
            }

            const bDirectMatch = this._nodeMatches(node, sQuery);

            if (bDirectMatch) {
                const oKept = { ...node };
                oKept.highlighted = true;
                if (node.children && node.children.length > 0) {
                    oKept.children = this._filterTree(node.children, sQuery, true);
                }
                aResult.push(oKept);
            } else {
                const aFilteredChildren = node.children && node.children.length > 0
                    ? this._filterTree(node.children, sQuery, false)
                    : [];

                if (aFilteredChildren.length > 0) {
                    const oKept = { ...node };
                    oKept.highlighted = false;
                    oKept.children = aFilteredChildren;
                    aResult.push(oKept);
                }
            }
        }

        return aResult;
    }

    private _nodeMatches(node: any, sQuery: string): boolean {
        return (
            (node.id         && node.id.toLowerCase().includes(sQuery))         ||
            (node.title      && node.title.toLowerCase().includes(sQuery))      ||
            (node.type       && node.type.toLowerCase().includes(sQuery))       ||
            (node.providerId && node.providerId.toLowerCase().includes(sQuery))
        );
    }

    
    public formatProviderHighlight(sValue: string, sQuery: string): string {
        return this.formatHighlight(sValue || "BTP", sQuery);
    }

     formatHighlight(sValue: string, sQuery: string): string {
        if (!sValue) return "";
        if (!sQuery || sQuery.length === 0) return this._escapeHtml(sValue);

        const sLower = sValue.toLowerCase();
        const iIdx = sLower.indexOf(sQuery);

        if (iIdx === -1) return this._escapeHtml(sValue);

        const before = this._escapeHtml(sValue.substring(0, iIdx));
        const match  = this._escapeHtml(sValue.substring(iIdx, iIdx + sQuery.length));
        const after  = this._escapeHtml(sValue.substring(iIdx + sQuery.length));

        return `${before}<span style="background:#FFE066;color:#1a1a1a;font-weight:700;border-radius:2px;padding:0 2px;">${match}</span>${after}`;
    }

    private _escapeHtml(s: string): string {
        return s
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    public onTypeFilterChange(oEvent: any): void {
        const sSelectedKey = oEvent.getParameter("selectedItem").getKey();
        const oTable = this.byId("roleTree") as TreeTable;
        const oModel = this.getView()?.getModel() as JSONModel;
        if (!oTable || !oModel) return;

        if (sSelectedKey === "all") {
            oModel.setProperty("/roles", JSON.parse(JSON.stringify(this._aOriginalRoles)));
            oModel.setProperty("/_searchQuery", "");
            oModel.refresh(true);
            oTable.collapseAll();
        } else {
            const aFiltered = this._filterTreeByType(
                JSON.parse(JSON.stringify(this._aOriginalRoles)),
                sSelectedKey,
                false
            );
            oModel.setProperty("/roles", aFiltered);
            oModel.setProperty("/_searchQuery", "");
            oModel.refresh(true);
            oTable.expandToLevel(10);
        }
    }

    private _filterTreeByType(aNodes: any[], sType: string, bAncestorMatched: boolean): any[] {
        const aResult: any[] = [];

        for (const node of aNodes) {
            if (bAncestorMatched) {
                const oKept = { ...node };
                oKept.highlighted = node.type === sType;
                if (node.children && node.children.length > 0) {
                    oKept.children = this._filterTreeByType(node.children, sType, true);
                }
                aResult.push(oKept);
                continue;
            }

            const bDirectMatch = node.type === sType;

            if (bDirectMatch) {
                const oKept = { ...node };
                oKept.highlighted = true;
                if (node.children && node.children.length > 0) {
                    oKept.children = this._filterTreeByType(node.children, sType, true);
                }
                aResult.push(oKept);
            } else {
                const aFilteredChildren = node.children && node.children.length > 0
                    ? this._filterTreeByType(node.children, sType, false)
                    : [];

                if (aFilteredChildren.length > 0) {
                    const oKept = { ...node };
                    oKept.highlighted = false;
                    oKept.children = aFilteredChildren;
                    aResult.push(oKept);
                }
            }
        }

        return aResult;
    }

    public onExpandAll(): void {
        const oTable = this.byId("roleTree") as TreeTable;
        if (oTable) oTable.expandToLevel(10);
    }

    public onCollapseAll(): void {
        const oTable = this.byId("roleTree") as TreeTable;
        const oModel = this.getView()?.getModel() as JSONModel;
        if (!oTable || !oModel) return;

        oModel.setProperty("/roles", JSON.parse(JSON.stringify(this._aOriginalRoles)));
        oModel.setProperty("/_searchQuery", "");
        oModel.refresh(true);
        oTable.collapseAll();
    }
}