sap.ui.define(["sap/m/MessageBox", "sap/ui/core/mvc/Controller", "sap/ui/model/json/JSONModel"], function (MessageBox, Controller, JSONModel) {
  "use strict";

  /**
   * @namespace be.nmbs.overviewworkzone.controller
   */
  const overview = Controller.extend("be.nmbs.overviewworkzone.controller.overview", {
    constructor: function constructor() {
      Controller.prototype.constructor.apply(this, arguments);
      this._sCurrentQuery = "";
      this._aOriginalRoles = [];
    },
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
      const oModel = this.getOwnerComponent()?.getModel();
      if (!oModel) {
        console.error("OData v4 model niet gevonden.");
        return;
      }
      const isLocal = ["localhost", "port", "4004"].some(s => window.location.hostname.includes(s));
      try {
        let oBinding;
        if (isLocal) {
          oBinding = oModel.bindContext("/analyzeExport(...)");
        } else {
          const sEnv = this.byId("environmentSelect")?.getSelectedKey() || "workzone-dev";
          const sSiteId = (this.byId("siteIdInput")?.getValue() || "").trim();
          if (!sSiteId) {
            MessageBox.warning("Vul een Site ID in om data te laden.");
            return;
          }
          oBinding = oModel.bindContext("/getWorkzoneData(...)", undefined, {
            $$inheritExpandSelect: false
          });
          oBinding.setParameter("env", sEnv);
          oBinding.setParameter("siteId", sSiteId);
        }
        await oBinding.execute();
        const result = oBinding.getBoundContext()?.getObject();
        const raw = result?.value || result;
        const data = Array.isArray(raw) ? raw[0] : raw;
        data._searchQuery = "";
        this._aOriginalRoles = JSON.parse(JSON.stringify(data.roles || []));
        this.getView()?.setModel(new JSONModel(data));
        oBinding.destroy();
      } catch (error) {
        console.error("Fout tijdens laden:", error);
        if (!error.canceled) {
          MessageBox.error("Data ophalen mislukt: " + (error.message || "Server Error"));
        }
      }
    },
    onLoad: function _onLoad() {
      this._loadData();
    },
    onSearch: function _onSearch(oEvent) {
      const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").trim();
      this._sCurrentQuery = sQuery.toLowerCase();
      const oTable = this.byId("roleTree");
      const oModel = this.getView()?.getModel();
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
    },
    onExportToExcel: async function _onExportToExcel() {
      const oModel = this.getView()?.getModel();
      if (!oModel) return;
      try {
        const XLSX = await this._loadSheetJS();
        const oStats = oModel.getProperty("/statistics") || {};
        const sEnv = this.byId("environmentSelect")?.getSelectedItem()?.getText() || "LOCAL";
        const rows = [];
        rows.push(["Role Name", "Role ID", "Provider", "Space Name", "Space ID", "Page Name", "Page ID", "App Name", "App ID"]);
        rows.push([`Roles: ${oStats.totalRoles ?? ""}`, `Spaces: ${oStats.totalSpaces ?? ""}`, `Pages: ${oStats.totalPages ?? ""}`, `Apps: ${oStats.totalApps ?? ""}`, "", "", "", "", ""]);
        rows.push(["", "", "", "", "", "", "", "", ""]);
        for (const role of this._aOriginalRoles) {
          const spaces = role.children || [];
          if (spaces.length === 0) {
            rows.push([role.title || "", role.id || "", role.providerId || "BTP", "", "", "", "", "", ""]);
            continue;
          }
          let roleFirstRow = true;
          for (const space of spaces) {
            const pages = space.children || [];
            if (pages.length === 0) {
              const row = this._makeRow();
              if (roleFirstRow) {
                row[0] = role.title || "";
                row[1] = role.id || "";
                row[2] = role.providerId || "BTP";
                roleFirstRow = false;
              }
              row[3] = space.title || "";
              row[4] = space.id || "";
              rows.push(row);
              continue;
            }
            let spaceFirstRow = true;
            for (const page of pages) {
              const apps = page.children || [];
              if (apps.length === 0) {
                const row = this._makeRow();
                if (roleFirstRow) {
                  row[0] = role.title || "";
                  row[1] = role.id || "";
                  row[2] = role.providerId || "BTP";
                  roleFirstRow = false;
                }
                if (spaceFirstRow) {
                  row[3] = space.title || "";
                  row[4] = space.id || "";
                  spaceFirstRow = false;
                }
                row[5] = page.title || "";
                row[6] = page.id || "";
                rows.push(row);
                continue;
              }
              let pageFirstRow = true;
              for (const app of apps) {
                const row = this._makeRow();
                if (roleFirstRow) {
                  row[0] = role.title || "";
                  row[1] = role.id || "";
                  row[2] = role.providerId || "BTP";
                  roleFirstRow = false;
                }
                if (spaceFirstRow) {
                  row[3] = space.title || "";
                  row[4] = space.id || "";
                  spaceFirstRow = false;
                }
                if (pageFirstRow) {
                  row[5] = page.title || "";
                  row[6] = page.id || "";
                  pageFirstRow = false;
                }
                row[7] = app.title || app.id || "";
                row[8] = app.id || "";
                rows.push(row);
              }
            }
          }
        }
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"] = [{
          wch: 35
        }, {
          wch: 55
        }, {
          wch: 25
        }, {
          wch: 35
        }, {
          wch: 40
        }, {
          wch: 35
        }, {
          wch: 40
        }, {
          wch: 35
        }, {
          wch: 55
        }];
        ws["!freeze"] = {
          xSplit: 0,
          ySplit: 1
        };
        for (let col = 0; col <= 8; col++) {
          const addr = XLSX.utils.encode_cell({
            r: 0,
            c: col
          });
          if (!ws[addr]) continue;
          ws[addr].s = {
            font: {
              bold: true,
              color: {
                rgb: "0070F2"
              },
              sz: 10
            },
            fill: {
              patternType: "solid",
              fgColor: {
                rgb: "E8F2FF"
              }
            },
            alignment: {
              horizontal: "left"
            }
          };
        }
        const colColors = {
          0: "F5F5F5",
          1: "F5F5F5",
          2: "F5F5F5",
          3: "E8F2FF",
          4: "E8F2FF",
          5: "FFF8E6",
          6: "FFF8E6",
          7: "EDFBF0",
          8: "EDFBF0"
        };
        const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
        for (let r = 3; r <= range.e.r; r++) {
          for (let c = 0; c <= 8; c++) {
            const addr = XLSX.utils.encode_cell({
              r,
              c
            });
            if (!ws[addr] || !ws[addr].v) continue;
            ws[addr].s = {
              fill: {
                patternType: "solid",
                fgColor: {
                  rgb: colColors[c]
                }
              },
              alignment: {
                vertical: "center"
              },
              font: {
                sz: 10
              }
            };
          }
        }
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Workzone Hierarchy");
        const sDate = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `WorkzoneHierarchy_${sEnv}_${sDate}.xlsx`);
      } catch (error) {
        console.error("Export mislukt:", error);
        MessageBox.error("Excel export mislukt: " + (error.message || "Onbekende fout"));
      }
    },
    _makeRow: function _makeRow() {
      return ["", "", "", "", "", "", "", "", ""];
    },
    // UI5s export to excel tool niet goed voor onze use case. npm package doet moeilijk
    // Dus haal XLSX package statisch op.
    _loadSheetJS: function _loadSheetJS() {
      return new Promise((resolve, reject) => {
        if (window.XLSX) {
          resolve(window.XLSX);
          return;
        }
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        script.onload = () => resolve(window.XLSX);
        script.onerror = () => reject(new Error("SheetJS kon niet geladen worden"));
        document.head.appendChild(script);
      });
    },
    _filterTree: function _filterTree(aNodes, sQuery, bAncestorMatched) {
      const aResult = [];
      for (const node of aNodes) {
        if (bAncestorMatched) {
          const oKept = {
            ...node
          };
          oKept.highlighted = this._nodeMatches(node, sQuery);
          if (node.children?.length > 0) oKept.children = this._filterTree(node.children, sQuery, true);
          aResult.push(oKept);
          continue;
        }
        const bDirectMatch = this._nodeMatches(node, sQuery);
        if (bDirectMatch) {
          const oKept = {
            ...node
          };
          oKept.highlighted = true;
          if (node.children?.length > 0) oKept.children = this._filterTree(node.children, sQuery, true);
          aResult.push(oKept);
        } else {
          const aFilteredChildren = node.children?.length > 0 ? this._filterTree(node.children, sQuery, false) : [];
          if (aFilteredChildren.length > 0) {
            aResult.push({
              ...node,
              highlighted: false,
              children: aFilteredChildren
            });
          }
        }
      }
      return aResult;
    },
    _nodeMatches: function _nodeMatches(node, sQuery) {
      return node.id && node.id.toLowerCase().includes(sQuery) || node.title && node.title.toLowerCase().includes(sQuery) || node.type && node.type.toLowerCase().includes(sQuery) || node.providerId && node.providerId.toLowerCase().includes(sQuery);
    },
    formatProviderHighlight: function _formatProviderHighlight(sValue, sQuery) {
      return this.formatHighlight(sValue || "BTP", sQuery);
    },
    formatHighlight: function _formatHighlight(sValue, sQuery) {
      if (!sValue) return "";
      if (!sQuery) return this._escapeHtml(sValue);
      const iIdx = sValue.toLowerCase().indexOf(sQuery);
      if (iIdx === -1) return this._escapeHtml(sValue);
      return this._escapeHtml(sValue.substring(0, iIdx)) + `<span style="background:#FFE066;color:#1a1a1a;font-weight:700;border-radius:2px;padding:0 2px;">${this._escapeHtml(sValue.substring(iIdx, iIdx + sQuery.length))}</span>` + this._escapeHtml(sValue.substring(iIdx + sQuery.length));
    },
    // convert tekens naar tekst (<, >, &, ")
    _escapeHtml: function _escapeHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    },
    onExpandAll: function _onExpandAll() {
      this.byId("roleTree")?.expandToLevel(10);
    },
    onCollapseAll: function _onCollapseAll() {
      const oTable = this.byId("roleTree");
      const oModel = this.getView()?.getModel();
      if (!oTable || !oModel) return;
      oModel.setProperty("/roles", JSON.parse(JSON.stringify(this._aOriginalRoles)));
      oModel.setProperty("/_searchQuery", "");
      oModel.refresh(true);
      oTable.collapseAll();
    }
  });
  return overview;
});
//# sourceMappingURL=overview-dbg.controller.js.map
