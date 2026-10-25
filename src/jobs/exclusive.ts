/** Garantiza que las ejecuciones de un job (programadas o forzadas con /config forzar) no se solapen. */
export class Exclusive {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
