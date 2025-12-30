// Makes ts-node ignore warnings, so mocha --watch does work
process.env.TS_NODE_IGNORE_WARNINGS = 'TRUE';
// Sets the correct tsconfig for testing
process.env.TS_NODE_PROJECT = 'test/tsconfig.json';

// Don't silently swallow unhandled rejections
process.on('unhandledRejection', (e: any) => {
    throw e;
});

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
import { should, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinonChai from 'sinon-chai';

should();
use(sinonChai);
use(chaiAsPromised);
