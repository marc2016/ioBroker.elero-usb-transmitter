import { tests } from '@iobroker/testing';
import path from 'path';

// Validate the package files
tests.packageFiles(path.resolve('.'));
