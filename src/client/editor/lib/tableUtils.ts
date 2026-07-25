import { Node as PMNode } from "prosemirror-model";
import { Selection, Transaction } from "prosemirror-state";
import { CellSelection, TableMap } from "prosemirror-tables";
import { findParentNode } from "prosemirror-utils";

// prosemirror-utils@1.0.0 removed every table-related helper (createTable,
// getCellsInColumn, getCellsInRow, isColumnSelected, isRowSelected,
// isTableSelected, selectColumn, selectRow, selectTable, ...) — see
// https://github.com/atlassian/prosemirror-utils/blob/master/CHANGELOG.md#100-2020-09-21
// ("removed `prosemirror-tables` dependency" / functions "moved to
// `editor-tables`", which was never published publicly).
//
// This module reimplements the subset still used by this editor, ported
// from prosemirror-utils@0.9.6's source and adapted to the TableMap /
// CellSelection APIs of the `prosemirror-tables` version already used here.

export interface NodeWithPos {
  pos: number;
  start: number;
  node: PMNode;
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const cloneTr = (tr: Transaction): Transaction =>
  Object.assign(Object.create(tr), tr).setTime(Date.now());

const findTable = (selection: Selection): NodeWithPos | undefined =>
  findParentNode(
    node => !!node.type.spec.tableRole && node.type.spec.tableRole === "table"
  )(selection);

const isCellSelection = (selection: Selection): selection is CellSelection =>
  selection instanceof CellSelection;

const isRectSelected = (rect: Rect) => (selection: CellSelection): boolean => {
  const map = TableMap.get(selection.$anchorCell.node(-1));
  const start = selection.$anchorCell.start(-1);
  const cells = map.cellsInRect(rect);
  const selectedCells = map.cellsInRect(
    map.rectBetween(
      selection.$anchorCell.pos - start,
      selection.$headCell.pos - start
    )
  );

  for (let i = 0, count = cells.length; i < count; i++) {
    if (selectedCells.indexOf(cells[i]) === -1) {
      return false;
    }
  }

  return true;
};

export const isColumnSelected = (columnIndex: number) => (
  selection: Selection
): boolean => {
  if (isCellSelection(selection)) {
    const map = TableMap.get(selection.$anchorCell.node(-1));
    return isRectSelected({
      left: columnIndex,
      right: columnIndex + 1,
      top: 0,
      bottom: map.height,
    })(selection);
  }
  return false;
};

export const isRowSelected = (rowIndex: number) => (
  selection: Selection
): boolean => {
  if (isCellSelection(selection)) {
    const map = TableMap.get(selection.$anchorCell.node(-1));
    return isRectSelected({
      left: 0,
      right: map.width,
      top: rowIndex,
      bottom: rowIndex + 1,
    })(selection);
  }
  return false;
};

export const isTableSelected = (selection: Selection): boolean => {
  if (isCellSelection(selection)) {
    const map = TableMap.get(selection.$anchorCell.node(-1));
    return isRectSelected({
      left: 0,
      right: map.width,
      top: 0,
      bottom: map.height,
    })(selection);
  }
  return false;
};

export const getCellsInColumn = (columnIndex: number) => (
  selection: Selection
): NodeWithPos[] | undefined => {
  const table = findTable(selection);
  if (table) {
    const map = TableMap.get(table.node);
    if (columnIndex >= 0 && columnIndex <= map.width - 1) {
      const cells = map.cellsInRect({
        left: columnIndex,
        right: columnIndex + 1,
        top: 0,
        bottom: map.height,
      });
      return cells.map(nodePos => {
        const node = table.node.nodeAt(nodePos);
        const pos = nodePos + table.start;
        return { pos, start: pos + 1, node };
      });
    }
  }
  return undefined;
};

export const getCellsInRow = (rowIndex: number) => (
  selection: Selection
): NodeWithPos[] | undefined => {
  const table = findTable(selection);
  if (table) {
    const map = TableMap.get(table.node);
    if (rowIndex >= 0 && rowIndex <= map.height - 1) {
      const cells = map.cellsInRect({
        left: 0,
        right: map.width,
        top: rowIndex,
        bottom: rowIndex + 1,
      });
      return cells.map(nodePos => {
        const node = table.node.nodeAt(nodePos);
        const pos = nodePos + table.start;
        return { pos, start: pos + 1, node };
      });
    }
  }
  return undefined;
};

const select = (type: "row" | "column") => (index: number) => (
  tr: Transaction
): Transaction => {
  const table = findTable(tr.selection);
  const isRowSelection = type === "row";
  if (table) {
    const map = TableMap.get(table.node);

    if (index >= 0 && index < (isRowSelection ? map.height : map.width)) {
      const left = isRowSelection ? 0 : index;
      const top = isRowSelection ? index : 0;
      const right = isRowSelection ? map.width : index + 1;
      const bottom = isRowSelection ? index + 1 : map.height;

      const cellsInFirstRow = map.cellsInRect({
        left,
        top,
        right: isRowSelection ? right : left + 1,
        bottom: isRowSelection ? top + 1 : bottom,
      });

      const cellsInLastRow =
        bottom - top === 1
          ? cellsInFirstRow
          : map.cellsInRect({
              left: isRowSelection ? left : right - 1,
              top: isRowSelection ? bottom - 1 : top,
              right,
              bottom,
            });

      const head = table.start + cellsInFirstRow[0];
      const anchor = table.start + cellsInLastRow[cellsInLastRow.length - 1];
      const $head = tr.doc.resolve(head);
      const $anchor = tr.doc.resolve(anchor);

      return cloneTr(tr.setSelection(new CellSelection($anchor, $head)));
    }
  }
  return tr;
};

export const selectColumn = select("column");
export const selectRow = select("row");

export const selectTable = (tr: Transaction): Transaction => {
  const table = findTable(tr.selection);
  if (table) {
    const { map } = TableMap.get(table.node);
    if (map && map.length) {
      const head = table.start + map[0];
      const anchor = table.start + map[map.length - 1];
      const $head = tr.doc.resolve(head);
      const $anchor = tr.doc.resolve(anchor);
      return cloneTr(tr.setSelection(new CellSelection($anchor, $head)));
    }
  }
  return tr;
};

interface TableNodeTypes {
  cell: PMNode["type"];
  header_cell: PMNode["type"];
  row: PMNode["type"];
  table: PMNode["type"];
}

const tableNodeTypes = (schema): TableNodeTypes => {
  if (schema.cached.tableNodeTypes) {
    return schema.cached.tableNodeTypes;
  }
  const roles: Partial<TableNodeTypes> = {};
  Object.keys(schema.nodes).forEach(type => {
    const nodeType = schema.nodes[type];
    if (nodeType.spec.tableRole) {
      roles[nodeType.spec.tableRole] = nodeType;
    }
  });
  schema.cached.tableNodeTypes = roles;
  return roles as TableNodeTypes;
};

const createCell = (cellType: PMNode["type"], cellContent = null) =>
  cellContent
    ? cellType.createChecked(null, cellContent)
    : cellType.createAndFill();

export const createTable = (
  schema,
  rowsCount = 3,
  colsCount = 3,
  withHeaderRow = true,
  cellContent = null
): PMNode => {
  const {
    cell: tableCell,
    header_cell: tableHeader,
    row: tableRow,
    table,
  } = tableNodeTypes(schema);

  const cells = [];
  const headerCells = [];
  for (let i = 0; i < colsCount; i++) {
    cells.push(createCell(tableCell, cellContent));
    if (withHeaderRow) {
      headerCells.push(createCell(tableHeader, cellContent));
    }
  }

  const rows = [];
  for (let i = 0; i < rowsCount; i++) {
    rows.push(
      tableRow.createChecked(null, withHeaderRow && i === 0 ? headerCells : cells)
    );
  }

  return table.createChecked(null, rows);
};
