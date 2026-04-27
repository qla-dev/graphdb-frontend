import type {
  PublishedApi,
  SchemaColumn,
  SchemaTable
} from "@/types/schema";

export type CrudAction = "list" | "show" | "create" | "update" | "delete";
export type ApiMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface ApiQueryParameter {
  key: string;
  value: string;
}

export interface ApiPathParameter {
  key: string;
  value: string;
}

export interface GeneratedApiEndpoint {
  id: string;
  action: CrudAction;
  method: ApiMethod;
  name: string;
  path: string;
  description: string;
  sampleLabel: "Query params" | "Path params" | "Request body";
  sample: string;
  parameters: string[];
  query: ApiQueryParameter[];
  pathParams: ApiPathParameter[];
  body: Record<string, unknown> | null;
  requestBodyRaw: string | null;
}

export interface GeneratedApiModel {
  id: string;
  title: string;
  resource: string;
  table: SchemaTable;
  endpoints: GeneratedApiEndpoint[];
}

const methodByAction: Record<CrudAction, ApiMethod> = {
  list: "GET",
  show: "GET",
  create: "POST",
  update: "PUT",
  delete: "DELETE"
};

function apiBasePathForExplorer(publishedApi?: PublishedApi | null) {
  return (
    publishedApi?.apiBasePath?.replace(/\/+$/, "") ||
    "/api/published/{schemaSlug}"
  );
}

function tableTitle(table: SchemaTable) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function pathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resourceName(table: SchemaTable) {
  return pathSegment(table.name) || pathSegment(table.id) || "resource";
}

function routeKey(table: SchemaTable) {
  const primaryColumn = table.columns.find((column) => column.isPrimaryKey);
  return primaryColumn?.name ?? table.columns[0]?.name ?? "id";
}

function normalizedColumnName(column: SchemaColumn) {
  return column.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sampleTextValue(column: SchemaColumn) {
  const name = normalizedColumnName(column);

  if (name === "name") {
    return "john_doe";
  }
  if (name === "full_name" || name === "display_name") {
    return "John Doe";
  }
  if (name === "first_name") {
    return "John";
  }
  if (name === "last_name") {
    return "Doe";
  }
  if (
    name.includes("username") ||
    name.includes("user_name") ||
    name.includes("login") ||
    name.includes("handle")
  ) {
    return "john_doe";
  }
  if (name.includes("email")) {
    return "john.doe@example.com";
  }
  if (name.includes("password")) {
    return "SecurePass123!";
  }
  if (
    name.includes("phone") ||
    name.includes("mobile") ||
    name.includes("tel")
  ) {
    return "+38761123456";
  }
  if (
    name === "address" ||
    name.includes("street") ||
    name.includes("address_line")
  ) {
    return "Zmaja od Bosne 12";
  }
  if (name.includes("city")) {
    return "Sarajevo";
  }
  if (name.includes("country")) {
    return "Bosnia and Herzegovina";
  }
  if (name.includes("state") || name.includes("region")) {
    return "Federation of Bosnia and Herzegovina";
  }
  if (name.includes("postal") || name.includes("zip")) {
    return "71000";
  }
  if (name.includes("company") || name.includes("organization")) {
    return "Acme d.o.o.";
  }
  if (name.includes("title")) {
    return "Senior Developer";
  }
  if (name.includes("role")) {
    return "admin";
  }
  if (name.includes("status")) {
    return "active";
  }
  if (name.includes("description") || name.includes("summary")) {
    return "Sample description for testing.";
  }
  if (
    name.includes("message") ||
    name.includes("content") ||
    name.includes("body")
  ) {
    return "Hello from GraphDB Studio.";
  }
  if (name.includes("note") || name.includes("comment")) {
    return "Sample note";
  }
  if (name.includes("slug")) {
    return "john-doe";
  }
  if (
    name.includes("url") ||
    name.includes("website") ||
    name.includes("link")
  ) {
    return "https://example.com";
  }
  if (
    name.includes("avatar") ||
    name.includes("image") ||
    name.includes("photo")
  ) {
    return "https://images.example.com/john-doe.jpg";
  }
  if (name.includes("token")) {
    return "demo_token_123456";
  }
  if (name.includes("api_key") || name.includes("apikey")) {
    return "demo_api_key_123456";
  }
  if (name.includes("sku")) {
    return "SKU-001";
  }
  if (name.includes("code")) {
    return "CODE-001";
  }
  if (name.includes("currency")) {
    return "BAM";
  }
  if (name.includes("language") || name.includes("locale")) {
    return "en";
  }
  if (name.includes("color") || name.includes("colour")) {
    return "#22c55e";
  }
  if (name.includes("gender")) {
    return "male";
  }
  if (name.includes("iban")) {
    return "BA391290079401028494";
  }

  return `${name}_sample`;
}

function sampleIntegerValue(column: SchemaColumn) {
  const name = normalizedColumnName(column);

  if (column.isPrimaryKey || name === "id" || name.endsWith("_id")) {
    return 1;
  }
  if (name.includes("age")) {
    return 30;
  }
  if (name.includes("year")) {
    return 2026;
  }
  if (name.includes("month")) {
    return 4;
  }
  if (name.includes("day")) {
    return 27;
  }
  if (
    name.includes("quantity") ||
    name.includes("count") ||
    name.includes("stock")
  ) {
    return 5;
  }
  if (
    name.includes("price") ||
    name.includes("amount") ||
    name.includes("total") ||
    name.includes("cost")
  ) {
    return 199;
  }
  if (
    name.includes("sort") ||
    name.includes("order") ||
    name.includes("position")
  ) {
    return 1;
  }

  return 1;
}

function sampleDecimalValue(column: SchemaColumn) {
  const name = normalizedColumnName(column);

  if (name.includes("latitude") || name === "lat") {
    return 43.8563;
  }
  if (name.includes("longitude") || name === "lng" || name === "lon") {
    return 18.4131;
  }
  if (
    name.includes("rate") ||
    name.includes("tax") ||
    name.includes("discount") ||
    name.includes("percent")
  ) {
    return 17.5;
  }
  if (
    name.includes("price") ||
    name.includes("amount") ||
    name.includes("total") ||
    name.includes("cost") ||
    name.includes("balance")
  ) {
    return 99.95;
  }

  return 99.95;
}

function sampleBooleanValue(column: SchemaColumn) {
  const name = normalizedColumnName(column);

  if (
    name.includes("deleted") ||
    name.includes("archived") ||
    name.includes("disabled") ||
    name.includes("blocked") ||
    name.includes("locked")
  ) {
    return false;
  }

  return true;
}

function sampleDateValue(column: SchemaColumn, type: string) {
  const name = normalizedColumnName(column);

  if (name.includes("birth") || name.includes("dob")) {
    return "1990-05-15";
  }
  if (name === "created_at") {
    return "2026-04-27 10:30:00";
  }
  if (name === "updated_at") {
    return "2026-04-27 10:45:00";
  }
  if (name.includes("start")) {
    return /\bdate\b/.test(type) && !/\b(datetime|timestamp|time)\b/.test(type)
      ? "2026-05-01"
      : "2026-05-01 09:00:00";
  }
  if (name.includes("end")) {
    return /\bdate\b/.test(type) && !/\b(datetime|timestamp|time)\b/.test(type)
      ? "2026-05-01"
      : "2026-05-01 17:00:00";
  }

  if (/\bdate\b/.test(type) && !/\b(datetime|timestamp|time)\b/.test(type)) {
    return "2026-04-27";
  }
  if (/\btime\b/.test(type) && !/\b(datetime|timestamp)\b/.test(type)) {
    return "10:30:00";
  }

  return "2026-04-27 10:30:00";
}

function sampleJsonValue(column: SchemaColumn) {
  const name = normalizedColumnName(column);

  if (name.includes("settings") || name.includes("preferences")) {
    return {
      theme: "dark",
      notifications: true
    };
  }
  if (name.includes("metadata")) {
    return {
      source: "graphdb",
      imported_by: "john_doe"
    };
  }

  return {
    sample: true
  };
}

export function sampleValue(column: SchemaColumn) {
  const type = column.type.toLowerCase();

  if (/\buuid\b/.test(type)) {
    return "00000000-0000-0000-0000-000000000001";
  }
  if (/\b(bigint|int|integer|smallint|tinyint)\b/.test(type)) {
    return sampleIntegerValue(column);
  }
  if (/\b(decimal|double|float|numeric|real)\b/.test(type)) {
    return sampleDecimalValue(column);
  }
  if (/\b(bool|boolean|bit)\b/.test(type)) {
    return sampleBooleanValue(column);
  }
  if (/\b(date|time|timestamp|datetime)\b/.test(type)) {
    return sampleDateValue(column, type);
  }
  if (/\b(json)\b/.test(type)) {
    return sampleJsonValue(column);
  }
  return sampleTextValue(column);
}

function objectFromColumns(columns: SchemaColumn[]) {
  return columns.reduce<Record<string, unknown>>((payload, column) => {
    payload[column.name] = sampleValue(column);
    return payload;
  }, {});
}

function sampleAsJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

function buildEndpoint(
  table: SchemaTable,
  action: CrudAction,
  basePath: string
): GeneratedApiEndpoint {
  const title = tableTitle(table);
  const resource = resourceName(table);
  const key = routeKey(table);
  const normalizedBasePath = basePath.replace(/\/+$/, "");
  const writableColumns = table.columns.filter(
    (column) => !column.isPrimaryKey
  );
  const samplePayloadColumns =
    writableColumns.length > 0 ? writableColumns : table.columns;
  const body = objectFromColumns(samplePayloadColumns);
  const keyColumn =
    table.columns.find((column) => column.name === key) ?? table.columns[0];
  const pathParamSample = keyColumn ? sampleValue(keyColumn) : 1;
  const pathParams = [{ key, value: String(pathParamSample) }];
  const baseResourcePath = `${normalizedBasePath}/${resource}`;
  const detailPath = `${baseResourcePath}/{${key}}`;

  const endpointByAction: Record<CrudAction, GeneratedApiEndpoint> = {
    list: {
      id: `${table.id}-list`,
      action: "list",
      method: methodByAction.list,
      name: `List ${title}`,
      path: baseResourcePath,
      description: `List ${title} rows. Add any table column as a query filter, plus \`limit\` and \`offset\`.`,
      sampleLabel: "Query params",
      sample: sampleAsJson({ limit: 50, offset: 0 }),
      parameters: [
        ...table.columns.map((column) => column.name),
        "limit",
        "offset"
      ],
      query: [
        { key: "limit", value: "50" },
        { key: "offset", value: "0" }
      ],
      pathParams: [],
      body: null,
      requestBodyRaw: null
    },
    show: {
      id: `${table.id}-show`,
      action: "show",
      method: methodByAction.show,
      name: `Get ${title}`,
      path: detailPath,
      description: `Fetch a single ${title} row by \`${key}\`.`,
      sampleLabel: "Path params",
      sample: sampleAsJson({ [key]: pathParamSample }),
      parameters: [key],
      query: [],
      pathParams,
      body: null,
      requestBodyRaw: null
    },
    create: {
      id: `${table.id}-create`,
      action: "create",
      method: methodByAction.create,
      name: `Create ${title}`,
      path: baseResourcePath,
      description: `Create a new ${title} row with writable columns in the JSON body.`,
      sampleLabel: "Request body",
      sample: sampleAsJson(body),
      parameters: samplePayloadColumns.map((column) => column.name),
      query: [],
      pathParams: [],
      body,
      requestBodyRaw: sampleAsJson(body)
    },
    update: {
      id: `${table.id}-update`,
      action: "update",
      method: methodByAction.update,
      name: `Update ${title}`,
      path: detailPath,
      description: `Update an existing ${title} row by \`${key}\` with a JSON body.`,
      sampleLabel: "Request body",
      sample: sampleAsJson(body),
      parameters: [key, ...samplePayloadColumns.map((column) => column.name)],
      query: [],
      pathParams,
      body,
      requestBodyRaw: sampleAsJson(body)
    },
    delete: {
      id: `${table.id}-delete`,
      action: "delete",
      method: methodByAction.delete,
      name: `Delete ${title}`,
      path: detailPath,
      description: `Delete an existing ${title} row by \`${key}\`.`,
      sampleLabel: "Path params",
      sample: sampleAsJson({ [key]: pathParamSample }),
      parameters: [key],
      query: [],
      pathParams,
      body: null,
      requestBodyRaw: null
    }
  };

  return endpointByAction[action];
}

export function buildGeneratedApiModels(
  tables: SchemaTable[],
  options?: { publishedApi?: PublishedApi | null; basePath?: string }
) {
  const basePath =
    options?.basePath ?? apiBasePathForExplorer(options?.publishedApi);

  return tables.map((table) => ({
    id: table.id,
    title: tableTitle(table),
    resource: resourceName(table),
    table,
    endpoints: (
      ["list", "show", "create", "update", "delete"] as CrudAction[]
    ).map((action) => buildEndpoint(table, action, basePath))
  }));
}
