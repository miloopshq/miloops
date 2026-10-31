import type http from 'node:http';

/** Listens on `port`, trying the next port up to `retries` times while it is taken. Resolves the bound port. */
export function listen(server: http.Server, port: number, host: string, retries: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      if (err.code === 'EADDRINUSE' && retries > 0) resolve(listen(server, port + 1, host, retries - 1));
      else reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve((server.address() as { port: number }).port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}
