import memoize, { Memoized } from "memoizee";

export default class HasCache {
	private cacheStore: (Memoized<any>)[] = [];

	// eslint-disable-next-line @typescript-eslint/ban-types
	protected cache = <F extends Function>(fn: F, options?: memoize.Options & { clearDepLength?: number }) => {
		const cached = memoize(fn, { promise: true, primitive: true, ...(options || {}) });
		this.cacheStore.push(cached);
		return cached;
	};

	public flush() {
		this.cacheStore.forEach(c => c.clear());
	}
}
