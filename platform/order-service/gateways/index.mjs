// Gateway resolver — pick the payment provider by name (env GATEWAY, default 'mock'). Adding a real
// provider = drop a file next to mock.mjs exporting createGateway() with the same interface, and register
// it here. Nothing else in the platform changes: the order service only knows the interface, not the vendor.
import { createGateway as mock } from './mock.mjs';

const REGISTRY = {
  mock,
  // razorpay: (await import('./razorpay.mjs')).createGateway,   // drop-in when live keys exist
  // payu:     (await import('./payu.mjs')).createGateway,
};

export function resolveGateway(name = process.env.GATEWAY || 'mock') {
  const make = REGISTRY[name];
  if (!make) throw new Error(`unknown gateway '${name}' — available: ${Object.keys(REGISTRY).join(', ')}. Add a gateways/${name}.mjs implementing createIntent()/verifyWebhook().`);
  return make();
}
