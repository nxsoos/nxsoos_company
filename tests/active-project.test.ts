import {describe,it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inferProject,toolTargets} from '../server/companion/active-project';

const time='2026-11-09T14:00:00Z';
function projects() {
  const base=mkdtempSync(join(tmpdir(),'nxsoos-project-target-'));
  for(const name of ['movie-list','map-markers','nxsoos_company']) {
    mkdirSync(join(base,name,'src'),{recursive:true});
    writeFileSync(join(base,name,'package.json'),'{}');
  }
  return {base,cwd:join(base,'movie-list'),map:join(base,'map-markers'),company:join(base,'nxsoos_company')};
}
describe('project attribution from actual tool inputs',()=>{
  it('uses command workdir project root rather than session folder',()=>{
    const {cwd,map}=projects();
    expect(inferProject('exec_command',{workdir:join(map,'src'),cmd:'npm test'},cwd,time)?.path).toBe(map);
    expect(inferProject('functions.exec_command',{workdir:map},cwd,time)?.name).toBe('map-markers');
  });
  it('reads native code-mode literal calls without mining embedded source or evaluating code',()=>{
    const {cwd,map,company}=projects();
    const code='text(await tools.exec_command({cmd: '+JSON.stringify('Write-Output "tools.exec_command({workdir: '+JSON.stringify(company)+'})"')+',workdir:'+JSON.stringify(map)+'}));';
    expect(inferProject('exec',code,cwd,time)?.path).toBe(map);
    expect(toolTargets('exec','const source = '+JSON.stringify('tools.exec_command({workdir:'+JSON.stringify(company)+'})')+';')).toEqual([]);
    expect(toolTargets('exec','tools.exec_command({workdir: `${process.env.SECRET}`})')).toEqual([]);
    expect(toolTargets('exec','tools.exec_command({workdir: getDirectory()})')).toEqual([]);
  });
  it('uses explicit patch/file targets and registered project names',()=>{
    const {cwd,map}=projects();
    const patch='*** Begin Patch\n*** Update File: '+join(map,'src','app.ts')+'\n@@\n-before\n+after\n*** End Patch';
    expect(inferProject('apply_patch',{command:patch},cwd,time)?.path).toBe(map);
    expect(inferProject('read_file',{path:join(map,'src','app.ts')},cwd,time,[{path:map,name:'Map makers'}])?.name).toBe('Map makers');
    expect(inferProject('exec','await tools.apply_patch('+JSON.stringify(patch)+');',cwd,time)?.path).toBe(map);
  });
  it('rejects incidental output, arbitrary tools, ambiguous multi-project batches and dynamic paths',()=>{
    const {cwd,map,company}=projects();
    expect(inferProject('Bash',{command:'Write-Output '+map},cwd,time)).toBeUndefined();
    expect(inferProject('agent_message',{path:map},cwd,time)).toBeUndefined();
    expect(inferProject('function_call_output',{workdir:map},cwd,time)).toBeUndefined();
    expect(inferProject('exec','await tools.exec_command({workdir:'+JSON.stringify(map)+'});await tools.exec_command({workdir:'+JSON.stringify(company)+'})',cwd,time)).toBeUndefined();
  });
});
