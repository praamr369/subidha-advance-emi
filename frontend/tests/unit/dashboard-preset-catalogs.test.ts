import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

type ParsedPreset = {
  id: string;
  order: string[];
  pinned: string[];
  hidden: string[];
};

type ParsedBoard = {
  widgetIds: string[];
  fixedWidgetIds: string[];
  defaultPinnedWidgetIds: string[];
  presets: ParsedPreset[];
};

const dashboardTargets = [
  {
    role: "admin",
    filePath: "src/app/(dashboard)/admin/page.tsx",
    storageKey: "subidha:dashboard-widgets:admin:v1",
  },
  {
    role: "admin-operations",
    filePath: "src/components/admin/dashboard/AdminOperationsDashboard.tsx",
    storageKey: "subidha:dashboard-widgets:admin-operations:v1",
  },
  {
    role: "cashier",
    filePath: "src/app/(dashboard)/cashier/page.tsx",
    storageKey: "subidha:dashboard-widgets:cashier:v1",
  },
  {
    role: "customer",
    filePath: "src/app/(dashboard)/customer/page.tsx",
    storageKey: "subidha:dashboard-widgets:customer:v1",
  },
  {
    role: "partner",
    filePath: "src/app/(dashboard)/partner/page.tsx",
    storageKey: "subidha:dashboard-widgets:partner:v1",
  },
] as const;

function getObjectProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  name: string
): ts.Expression | null {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (!ts.isIdentifier(property.name) || property.name.text !== name) continue;
    return property.initializer;
  }
  return null;
}

function parseStringArray(expression: ts.Expression | null): string[] {
  if (!expression || !ts.isArrayLiteralExpression(expression)) return [];
  return expression.elements
    .filter((entry): entry is ts.StringLiteral => ts.isStringLiteral(entry))
    .map((entry) => entry.text);
}

function buildConstStringMap(sourceFile: ts.SourceFile): Map<string, string> {
  const values = new Map<string, string>();

  function visit(node: ts.Node) {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        if (ts.isStringLiteral(declaration.initializer)) {
          values.set(declaration.name.text, declaration.initializer.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return values;
}

function resolveStringExpression(
  expression: ts.Expression,
  constants: Map<string, string>
): string | null {
  if (ts.isStringLiteral(expression)) return expression.text;
  if (ts.isIdentifier(expression)) return constants.get(expression.text) ?? null;
  return null;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression)) return unwrapExpression(expression.expression);
  if (ts.isAsExpression(expression)) return unwrapExpression(expression.expression);
  if (ts.isSatisfiesExpression(expression)) return unwrapExpression(expression.expression);
  return expression;
}

function parseBoardFromSource(filePath: string, storageKey: string): ParsedBoard {
  const absolutePath = join(process.cwd(), filePath);
  const content = readFileSync(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(absolutePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const constantStrings = buildConstStringMap(sourceFile);

  const boards: ParsedBoard[] = [];

  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(sourceFile) === "DashboardWidgetBoard") {
      let storageKeyValue: string | null = null;
      let widgetsExpression: ts.Expression | null = null;
      let presetsExpression: ts.Expression | null = null;

      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        if (!ts.isIdentifier(attribute.name)) continue;
        if (!attribute.initializer) continue;

        if (attribute.name.text === "storageKey" && ts.isStringLiteral(attribute.initializer)) {
          storageKeyValue = attribute.initializer.text;
          continue;
        }

        if (!ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) continue;
        const expression = unwrapExpression(attribute.initializer.expression);

        if (attribute.name.text === "storageKey") {
          storageKeyValue = resolveStringExpression(expression, constantStrings);
        }
        if (attribute.name.text === "widgets") widgetsExpression = expression;
        if (attribute.name.text === "presets") presetsExpression = expression;
      }

      if (storageKeyValue !== storageKey) {
        ts.forEachChild(node, visit);
        return;
      }

      const widgetIds: string[] = [];
      const fixedWidgetIds: string[] = [];
      const defaultPinnedWidgetIds: string[] = [];

      if (!widgetsExpression || !ts.isArrayLiteralExpression(unwrapExpression(widgetsExpression))) {
        throw new Error(`Unable to parse widgets array for ${filePath} (${storageKey})`);
      }
      const widgetArrayExpression = unwrapExpression(widgetsExpression) as ts.ArrayLiteralExpression;

      for (const widgetElement of widgetArrayExpression.elements) {
        if (!ts.isObjectLiteralExpression(widgetElement)) continue;
        const idNode = getObjectProperty(widgetElement, "id");
        if (!idNode || !ts.isStringLiteral(idNode)) continue;

        const widgetId = idNode.text;
        widgetIds.push(widgetId);

        const fixedNode = getObjectProperty(widgetElement, "fixed");
        if (fixedNode?.kind === ts.SyntaxKind.TrueKeyword) {
          fixedWidgetIds.push(widgetId);
        }

        const defaultPinnedNode = getObjectProperty(widgetElement, "defaultPinned");
        if (defaultPinnedNode?.kind === ts.SyntaxKind.TrueKeyword) {
          defaultPinnedWidgetIds.push(widgetId);
        }
      }

      const presets: ParsedPreset[] = [];
      if (presetsExpression && ts.isArrayLiteralExpression(unwrapExpression(presetsExpression))) {
        const presetArrayExpression = unwrapExpression(presetsExpression) as ts.ArrayLiteralExpression;
        for (const presetElement of presetArrayExpression.elements) {
          if (!ts.isObjectLiteralExpression(presetElement)) continue;
          const idNode = getObjectProperty(presetElement, "id");
          if (!idNode || !ts.isStringLiteral(idNode)) continue;

          presets.push({
            id: idNode.text,
            order: parseStringArray(getObjectProperty(presetElement, "order")),
            pinned: parseStringArray(getObjectProperty(presetElement, "pinned")),
            hidden: parseStringArray(getObjectProperty(presetElement, "hidden")),
          });
        }
      }

      boards.push({ widgetIds, fixedWidgetIds, defaultPinnedWidgetIds, presets });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (boards.length === 0) {
    throw new Error(`No DashboardWidgetBoard with storage key ${storageKey} found in ${filePath}`);
  }

  if (boards.length > 1) {
    throw new Error(`Multiple DashboardWidgetBoard entries found for storage key ${storageKey} in ${filePath}`);
  }

  return boards[0];
}

for (const target of dashboardTargets) {
  test(`${target.role}: preset catalog references valid widget IDs`, () => {
    const board = parseBoardFromSource(target.filePath, target.storageKey);
    const errors: string[] = [];
    const knownWidgetIds = new Set(board.widgetIds);
    const fixedWidgetIds = new Set(board.fixedWidgetIds);

    for (const pinnedWidgetId of board.defaultPinnedWidgetIds) {
      if (!knownWidgetIds.has(pinnedWidgetId)) {
        errors.push(`${target.role}: defaultPinned widget ${pinnedWidgetId} is not in widget registry`);
      }
    }

    for (const preset of board.presets) {
      if (preset.order.length !== board.widgetIds.length) {
        errors.push(
          `${target.role}/${preset.id}: order length ${preset.order.length} does not match widget count ${board.widgetIds.length}`
        );
      }

      const orderSet = new Set(preset.order);
      if (orderSet.size !== preset.order.length) {
        errors.push(`${target.role}/${preset.id}: order contains duplicate widget IDs`);
      }

      for (const widgetId of preset.order) {
        if (!knownWidgetIds.has(widgetId)) {
          errors.push(`${target.role}/${preset.id}: order references unknown widget '${widgetId}'`);
        }
      }

      for (const widgetId of board.widgetIds) {
        if (!orderSet.has(widgetId)) {
          errors.push(`${target.role}/${preset.id}: order is missing widget '${widgetId}'`);
        }
      }

      for (const widgetId of preset.pinned) {
        if (!knownWidgetIds.has(widgetId)) {
          errors.push(`${target.role}/${preset.id}: pinned references unknown widget '${widgetId}'`);
        }
      }

      for (const widgetId of preset.hidden) {
        if (!knownWidgetIds.has(widgetId)) {
          errors.push(`${target.role}/${preset.id}: hidden references unknown widget '${widgetId}'`);
        }
        if (fixedWidgetIds.has(widgetId)) {
          errors.push(`${target.role}/${preset.id}: hidden includes fixed widget '${widgetId}'`);
        }
      }
    }

    assert.equal(errors.length, 0, errors.join("\n"));
  });
}
