export interface HttpRequest<TBody = unknown, TParams extends Record<string, string> = Record<string, string>, TQuery extends Record<string, string> = Record<string, string>> {
  body: TBody;
  params: TParams;
  query: TQuery;
  tenantId: string;
}

export interface HttpResponse {
  status(code: number): HttpResponse;
  json(payload: unknown): void;
}
