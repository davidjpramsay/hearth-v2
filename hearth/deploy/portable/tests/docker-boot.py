#!/usr/bin/env python3
"""CI only: boot this run's preloaded images with disposable private storage, without HA."""
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile

spec = importlib.util.spec_from_file_location('portable_setup', Path(__file__).resolve().parents[1] / 'install.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)

PROBE = r"""
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
const base='http://127.0.0.1:4310/api/v1';
const runtime=await (await fetch(base+'/runtime')).json();
assert.equal(runtime.requiresSetup,true);
assert.equal(runtime.household,null);
const ownerKey=(await readFile('/run/hearth-secrets/first-use-code','utf8')).trim();
const response=await fetch(base+'/auth/phones/owner-claims',{method:'POST',headers:{Origin:'https://hearth.fixture.test','Content-Type':'application/json','User-Agent':'HearthCompanionTest'},body:JSON.stringify({ownerKey,phoneName:'Fixture phone',householdName:'Disposable fixture',adultName:'Fixture adult',timezone:'Australia/Perth'})});
assert.equal(response.status,200);
const session=await response.json();
const headers={Cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; '),'User-Agent':'HearthCompanionTest'};
const home=base+'/households/'+session.householdId;
const admin=await fetch(home+'/admin',{headers});
assert.equal(admin.status,200);
const state=await admin.json();
assert.equal(state.household.members.length,1);
assert.equal(state.pairedDevices.length,0);
const ha=await fetch(home+'/home-assistant-connection',{headers});
assert.equal(ha.status,200);assert.equal(await ha.json(),null);
assert.equal((await fetch(home+'/today?date='+runtime.localDate,{headers})).status,200);
await assert.rejects(access('/run/hearth-secrets/first-use-code'));
console.log(JSON.stringify({private:true,ownerClaim:true,proofConsumed:true,noHomeAssistant:true,today:true}));
"""


def main():
    if len(sys.argv) != 2 or not re.fullmatch('[a-f0-9]{40}', sys.argv[1]):
        raise SystemExit('Supply this CI run’s full image revision.')
    with tempfile.TemporaryDirectory(prefix='hearth-docker-proof-') as temporary:
        folder = Path(temporary).resolve() / 'installation'
        state = setup.prepare(folder, 'https://hearth.fixture.test', sys.argv[1], 18432, os.getuid() or 1000, os.getgid())
        def preloaded(args, cwd):
            if args[-1] == 'pull':
                return ''  # Only the two images built/labelled by this job; nothing is published yet.
            return setup.command(args, cwd)
        try:
            setup.start(folder, state, preloaded)
            assert (folder / 'data/first-phone.png').stat().st_mode & 0o777 == 0o600
            result = setup.command(['docker', 'compose', '--file', 'compose.yaml', 'exec', '-T', 'server', 'node', '--input-type=module', '-e', PROBE], folder)
            assert json.loads(result) == {'private': True, 'ownerClaim': True, 'proofConsumed': True, 'noHomeAssistant': True, 'today': True}
            assert setup.resume(folder) == state  # A consumed setup key must not prevent updates.
            print('PASS: generated Compose boots both candidate images as non-root, creates a private QR, claims the first adult and serves core data without HA.')
        finally:
            setup.command(['docker', 'compose', '--file', 'compose.yaml', 'down', '--remove-orphans'], folder)


if __name__ == '__main__':
    main()
