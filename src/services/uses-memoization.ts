import memoize, { Memoized } from "memoizee";

export default class UsesMemoization {
	private memoizeStore: (Memoized<any>)[] = [];

	// eslint-disable-next-line @typescript-eslint/ban-types
	protected memoize = <F extends Function>(fn: F, options?: memoize.Options & { clearDepLength?: number }) => {
		const cached = memoize(fn, { promise: true, primitive: true, ...(options || {}) });
		this.memoizeStore.push(cached);
		return cached;
	};

	public flush() {
		this.memoizeStore.forEach(c => c.clear());
	}
}
