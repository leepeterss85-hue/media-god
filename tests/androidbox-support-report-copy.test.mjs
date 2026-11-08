import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { copySupportReportText } from "../src/components/mg/supportReportCopy.js";

const fakeDocument = () => {
  let copied="", removed=0, restored=0;
  const field={
    value:"",style:{},setAttribute(){},focus(){},select(){},remove(){removed++;},
  };
  const doc={
    activeElement:{focus(){restored++;}},
    body:{appendChild(){}},
    createElement(tag){assert.equal(tag,"textarea");return field;},
    execCommand(cmd){assert.equal(cmd,"copy");copied=field.value;return true;},
  };
  return {doc,field,stats:()=>({copied,removed,restored})};
};

test("modern Android WebViews copy support report without DOM focus changes", async () => {
  let result="";
  const f=fakeDocument();
  const ok=await copySupportReportText("WebView 123",{
    nav:{clipboard:{writeText:async text=>{result=text;}}},
    doc:f.doc,
  });
  assert.equal(ok,true);
  assert.equal(result,"WebView 123");
  assert.deepEqual(f.stats(),{copied:"",removed:0,restored:0});
});

test("older Android box WebViews use local fallback when Clipboard API is absent", async () => {
  const f=fakeDocument();
  const ok=await copySupportReportText("Android 11\nPlayback notices: 2",{
    nav:{},doc:f.doc,
  });
  assert.equal(ok,true);
  assert.deepEqual(f.stats(),{
    copied:"Android 11\nPlayback notices: 2",removed:1,restored:1,
  });
});

test("clipboard permission denial uses the same safe legacy fallback", async () => {
  const f=fakeDocument();
  const ok=await copySupportReportText("Offline diagnostic",{ 
    nav:{clipboard:{writeText:async()=>{throw Error("denied");}}},doc:f.doc,
  });
  assert.equal(ok,true);
  assert.equal(f.stats().copied,"Offline diagnostic");
  assert.equal(f.stats().restored,1);
});

test("unavailable legacy clipboard fails closed and never leaves a temporary field mounted", async () => {
  assert.equal(await copySupportReportText("Report",{nav:{},doc:{}}),false);
  assert.equal(await copySupportReportText("",{nav:{},doc:{}}),false);
  const f=fakeDocument();
  f.doc.execCommand=()=>{throw Error("Clipboard disabled");};
  assert.equal(await copySupportReportText("Report",{nav:{},doc:f.doc}),false);
  assert.equal(f.stats().removed,1);
  assert.equal(f.stats().restored,1);
});

test("Settings support report uses privacy-safe device details and fallback copier", () => {
  const s=readFileSync(new URL("../src/components/mg/SettingsView.jsx",import.meta.url),"utf8");
  assert.match(s,/copySupportReportText\(lines\)/);
  assert.match(s,/\.\.\.getAndroidBoxSupportLines\(\)/);
  assert.doesNotMatch(s,/Browser:.*navigator\.userAgent/);
});
