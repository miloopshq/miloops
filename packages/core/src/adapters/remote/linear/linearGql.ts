import { BRAND } from '../../../model/brand';
import { graphqlError, type HttpClient } from '../http';
import { DEFAULT_API } from './schema';

export type LinearGql = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

const authHeader = (key: string) => (key.startsWith('lin_api_') ? key : `Bearer ${key}`);

/** GraphQL calls to Linear with a personal API key (`lin_api_…`) or an OAuth access token. */
export function linearGql(http: HttpClient, apiKey: string, apiUrl = DEFAULT_API): LinearGql {
  return async <T>(query: string, variables: Record<string, unknown> = {}) => {
    const r = await http.send<{ data?: T }>(apiUrl, {
      method: 'POST',
      headers: { Authorization: authHeader(apiKey), 'Content-Type': 'application/json', 'User-Agent': BRAND.slug },
      body: JSON.stringify({ query, variables }),
    });
    const err = graphqlError('Linear', r.body);
    if (err) throw err;
    return r.body.data as T;
  };
}
