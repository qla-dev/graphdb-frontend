import type { AiProviderResponse, SchemaCodeFormat } from "@/types/schema";

export interface GenerateSchemaRequest {
  prompt: string;
  format: SchemaCodeFormat;
  currentCode: string;
}

export interface AiSchemaProvider {
  id: string;
  label: string;
  generateSchema(request: GenerateSchemaRequest): Promise<AiProviderResponse>;
}

// TODO: Add an OpenAI provider here by implementing AiSchemaProvider and calling
// a server action or route handler that safely owns the API key.
