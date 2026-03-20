import MessageBox from "sap/m/MessageBox";
import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import TreeTable from "sap/ui/table/TreeTable";
import Select from "sap/m/Select";
import Input from "sap/m/Input";

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

    // ─── Load data ────────────────────────────────────────────────────────────────

    private async _loadData(): Promise<void> {
        const oView = this.getView();
        if (!oView) return;

        const oModel = (oView.getModel() || this.getOwnerComponent()?.getModel()) as ODataModel;
        if (!oModel) { console.error("OData v4 model niet gevonden."); return; }

        const isLocal = ["localhost", "port", "4004"].some(s => window.location.hostname.includes(s));

        try {
            let oBinding;

            if (isLocal) {
                // Offline: use local zip file, no params needed
                oBinding = oModel.bindContext("/analyzeExport(...)");
            } else {
                // Online: use env (destination name) + siteId from the toolbar
                const sEnv    = (this.byId("environmentSelect") as Select)?.getSelectedKey() || "workzone-dev";
                const sSiteId = ((this.byId("siteIdInput") as Input)?.getValue() || "").trim();

                if (!sSiteId) {
                    MessageBox.warning("Vul een Site ID in om data te laden.");
                    return;
                }

                oBinding = oModel.bindContext("/getWorkzoneData(...)");
                oBinding.setParameter("env",    sEnv);
                oBinding.setParameter("siteId", sSiteId);
            }

            await oBinding.execute();

            const result = oBinding.getBoundContext()?.getObject() as any;
            // value is an array with one element when returned from a function import
            const raw    = result?.value || result;
            const data   = Array.isArray(raw) ? raw[0] : raw;

            data._searchQuery = "";
            this._aOriginalRoles = JSON.parse(JSON.stringify(data.roles || []));

            this.getView()?.setModel(new JSONModel(data));

        } catch (error: any) {
            console.error("Fout tijdens laden:", error);
            if (!error.canceled) {
                MessageBox.error("Data ophalen mislukt: " + (error.message || "Server Error"));
            }
        }
    }

    /** Called by the Load button and by pressing Enter in the Site ID field */
    public onLoad(): void {
        this._loadData();
    }

    // ─── Search ───────────────────────────────────────────────────────────────────

    public onSearch(oEvent: any): void {
        const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").trim();
        this._sCurrentQuery = sQuery.toLowerCase();

        const oTable = this.byId("roleTree") as TreeTable;
        const oModel = this.getView()?.getModel() as JSONModel;
        if (!oTable || !oModel) return;

        if (this._sCurrentQuery.length > 0) {
            const aFiltered = this._filterTree(JSON.parse(JSON.stringify(this._aOriginalRoles)), this._sCurrentQuery, false);
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

    // ─── Excel Export ─────────────────────────────────────────────────────────────

    public async onExportToExcel(): Promise<void> {
        const oModel = this.getView()?.getModel() as JSONModel;
        if (!oModel) return;

        try {
            const XLSX    = await this._loadSheetJS();
            const oStats  = oModel.getProperty("/statistics") || {};
            const sEnv    = (this.byId("environmentSelect") as Select)?.getSelectedItem()?.getText() || "LOCAL";

            const rows: any[][] = [];

            rows.push(["Role Name", "Role ID", "Provider", "Space Name", "Space ID", "Page Name", "Page ID", "App ID"]);
            rows.push([`Roles: ${oStats.totalRoles ?? ""}`, `Spaces: ${oStats.totalSpaces ?? ""}`, `Pages: ${oStats.totalPages ?? ""}`, `Apps: ${oStats.totalApps ?? ""}`, "", "", "", ""]);
            rows.push(["", "", "", "", "", "", "", ""]);

            for (const role of this._aOriginalRoles) {
                const spaces = role.children || [];

                if (spaces.length === 0) {
                    rows.push([role.title || "", role.id || "", role.providerId || "BTP", "", "", "", "", ""]);
                    continue;
                }

                let roleFirstRow = true;
                for (const space of spaces) {
                    const pages = space.children || [];
                    if (pages.length === 0) {
                        const row = this._makeRow();
                        if (roleFirstRow) { row[0] = role.title || ""; row[1] = role.id || ""; row[2] = role.providerId || "BTP"; roleFirstRow = false; }
                        row[3] = space.title || ""; row[4] = space.id || "";
                        rows.push(row); continue;
                    }

                    let spaceFirstRow = true;
                    for (const page of pages) {
                        const apps = page.children || [];
                        if (apps.length === 0) {
                            const row = this._makeRow();
                            if (roleFirstRow)  { row[0] = role.title  || ""; row[1] = role.id  || ""; row[2] = role.providerId || "BTP"; roleFirstRow  = false; }
                            if (spaceFirstRow) { row[3] = space.title || ""; row[4] = space.id || ""; spaceFirstRow = false; }
                            row[5] = page.title || ""; row[6] = page.id || "";
                            rows.push(row); continue;
                        }

                        let pageFirstRow = true;
                        for (const app of apps) {
                            const row = this._makeRow();
                            if (roleFirstRow)  { row[0] = role.title  || ""; row[1] = role.id  || ""; row[2] = role.providerId || "BTP"; roleFirstRow  = false; }
                            if (spaceFirstRow) { row[3] = space.title || ""; row[4] = space.id || ""; spaceFirstRow = false; }
                            if (pageFirstRow)  { row[5] = page.title  || ""; row[6] = page.id  || ""; pageFirstRow  = false; }
                            row[7] = app.id || app.title || "";
                            rows.push(row);
                        }
                    }
                }
            }

            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws["!cols"] = [{ wch: 35 }, { wch: 55 }, { wch: 25 }, { wch: 35 }, { wch: 40 }, { wch: 35 }, { wch: 40 }, { wch: 55 }];
            ws["!freeze"] = { xSplit: 0, ySplit: 1 };

            for (let col = 0; col <= 7; col++) {
                const addr = XLSX.utils.encode_cell({ r: 0, c: col });
                if (!ws[addr]) continue;
                ws[addr].s = { font: { bold: true, color: { rgb: "0070F2" }, sz: 10 }, fill: { patternType: "solid", fgColor: { rgb: "E8F2FF" } }, alignment: { horizontal: "left" } };
            }

            const colColors: Record<number, string> = { 0: "F5F5F5", 1: "F5F5F5", 2: "F5F5F5", 3: "E8F2FF", 4: "E8F2FF", 5: "FFF8E6", 6: "FFF8E6", 7: "EDFBF0" };
            const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
            for (let r = 3; r <= range.e.r; r++) {
                for (let c = 0; c <= 7; c++) {
                    const addr = XLSX.utils.encode_cell({ r, c });
                    if (!ws[addr] || !ws[addr].v) continue;
                    ws[addr].s = { fill: { patternType: "solid", fgColor: { rgb: colColors[c] } }, alignment: { vertical: "center" }, font: { sz: 10 } };
                }
            }

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Workzone Hierarchy");

            const sDate = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `WorkzoneHierarchy_${sEnv}_${sDate}.xlsx`);

        } catch (error: any) {
            console.error("Export mislukt:", error);
            MessageBox.error("Excel export mislukt: " + (error.message || "Onbekende fout"));
        }
    }

    private _makeRow(): any[] { return ["", "", "", "", "", "", "", ""]; }

    // UI5s export to excel tool niet goed voor onze use case. npm package doet moeilijk
    // Dus haal XLSX package statisch op.
    private _loadSheetJS(): Promise<any> {
        return new Promise((resolve, reject) => {
            if ((window as any).XLSX) { resolve((window as any).XLSX); return; }
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
            script.onload  = () => resolve((window as any).XLSX);
            script.onerror = () => reject(new Error("SheetJS kon niet geladen worden"));
            document.head.appendChild(script);
        });
    }

    // ─── Tree filtering ───────────────────────────────────────────────────────────

    private _filterTree(aNodes: any[], sQuery: string, bAncestorMatched: boolean): any[] {
        const aResult: any[] = [];
        for (const node of aNodes) {
            if (bAncestorMatched) {
                const oKept = { ...node };
                oKept.highlighted = this._nodeMatches(node, sQuery);
                if (node.children?.length > 0) oKept.children = this._filterTree(node.children, sQuery, true);
                aResult.push(oKept);
                continue;
            }
            const bDirectMatch = this._nodeMatches(node, sQuery);
            if (bDirectMatch) {
                const oKept = { ...node };
                oKept.highlighted = true;
                if (node.children?.length > 0) oKept.children = this._filterTree(node.children, sQuery, true);
                aResult.push(oKept);
            } else {
                const aFilteredChildren = node.children?.length > 0 ? this._filterTree(node.children, sQuery, false) : [];
                if (aFilteredChildren.length > 0) {
                    aResult.push({ ...node, highlighted: false, children: aFilteredChildren });
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

    // ─── Formatters ───────────────────────────────────────────────────────────────

    public formatProviderHighlight(sValue: string, sQuery: string): string {
        return this.formatHighlight(sValue || "BTP", sQuery);
    }

    public formatHighlight(sValue: string, sQuery: string): string {
        if (!sValue) return "";
        if (!sQuery) return this._escapeHtml(sValue);
        const iIdx = sValue.toLowerCase().indexOf(sQuery);
        if (iIdx === -1) return this._escapeHtml(sValue);
        return this._escapeHtml(sValue.substring(0, iIdx))
            + `<span style="background:#FFE066;color:#1a1a1a;font-weight:700;border-radius:2px;padding:0 2px;">${this._escapeHtml(sValue.substring(iIdx, iIdx + sQuery.length))}</span>`
            + this._escapeHtml(sValue.substring(iIdx + sQuery.length));
    }

    // convert tekens naar tekst (<, >, &, ")
    private _escapeHtml(s: string): string {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    public onExpandAll(): void {
        (this.byId("roleTree") as TreeTable)?.expandToLevel(10);
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