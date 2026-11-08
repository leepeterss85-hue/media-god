import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const remote = readFileSync(new URL("../src/components/mg/FireTvRemote.jsx", import.meta.url), "utf8");
const memory = readFileSync(new URL("../src/components/mg/FireTvFocusMemory.jsx", import.meta.url), "utf8");
const between = (src, start, end) => src.slice(src.indexOf(start), src.indexOf(end));
class Element {
  constructor(x = 0, y = 0, width = 60, height = 40) {
    this.x = x; this.y = y; this.width = width; this.height = height;
    this.tagName = "BUTTON"; this.textContent = "Title";
  }
  getBoundingClientRect() {
    return {left:this.x,top:this.y,width:this.width,height:this.height,
      right:this.x+this.width,bottom:this.y+this.height};
  }
  getAttribute() {return "";}
}

test("remote focus does not force synchronous scroll layout on every key press", () => {
  const snippet = between(remote, "const focusElement = (element) => {", "const centre = (element) => {");
  const ctx = { HTMLElement:Element, visible:()=>true };
  vm.createContext(ctx);
  vm.runInContext(snippet + "\nglobalThis.tryFocus = focusElement;",ctx);
  let focusCalls=0,scrollCalls=0;
  const el = new Element();
  el.focus = () => {focusCalls++;};
  el.scrollIntoView = () => {scrollCalls++;};
  assert.equal(ctx.tryFocus(el),true);
  assert.equal(focusCalls,1,"D-pad must still focus synchronously");
  assert.equal(scrollCalls,0,"The focusin visibility listener owns offscreen scrolling");
  assert.match(remote,/document\.addEventListener\("focusin", keepFocusedControlVisible, true\)/);
  assert.match(remote,/if \(!offscreen\) \{/);
  assert.match(remote,/target\.scrollIntoView\(\{/);
});

test("single overlay query retains highest visible modal and video priority", () => {
  const snippet=between(remote,"const topOverlay = () => {","const focusables = (scope) =>");
  let queries=0;
  class Overlay extends Element {
    constructor(z,player=false) {
      super();this.z=z;this.player=player;
      this.classList={contains:(key)=>key==="bg-black/95" && player};
    }
    matches(sel) { return sel===".fixed.inset-0" && this.player; }
    querySelector() { return null; }
  }
  const dialog1=new Overlay(2),dialog2=new Overlay(100),video=new Overlay(5,true);
  const data=[dialog1,dialog2,video];
  const ctx={
    HTMLElement:Element,visible:()=>true,
    document:{querySelectorAll(){queries++;return data;}},
    window:{getComputedStyle:(el)=>({zIndex:String(el.z)})},
  };
  vm.createContext(ctx);vm.runInContext(snippet+"\nglobalThis.top = topOverlay;",ctx);
  assert.equal(ctx.top(),video);
  assert.equal(queries,1,"A D-pad press must not scan all overlays twice");
  data.pop();
  queries=0;
  assert.equal(ctx.top(),dialog2,"Without a player, highest dialog wins");
  assert.equal(queries,1);
});

test("row-aware target trusts already visible candidate list without rechecking ancestor styles",()=>{
  const snippet=between(remote,"const rowAwareTarget = (current, candidates, direction) => {","const tvShowsRemoteTarget = (current, direction) => {");
  const ctx={
    HTMLElement:Element,
    visible:()=>{throw Error("Duplicate expensive style checks are forbidden");},
    centre:el=>({x:el.x+el.width/2,y:el.y+el.height/2}),
  };
  vm.createContext(ctx);vm.runInContext(snippet+"\nglobalThis.next = rowAwareTarget;",ctx);
  const current=new Element(100,100);
  const left=new Element(20,100),right=new Element(200,100),down=new Element(105,180);
  assert.equal(ctx.next(current,[current,left,right,down],"right"),right);
  assert.equal(ctx.next(current,[current,left,right,down],"left"),left);
  assert.equal(ctx.next(current,[current,left,right,down],"down"),down);
});

test("unkeyed focus on the main app never enumerates every poster to remember focus", () => {
  const snippet=between(memory,"const snapshotFocus =","const resolveSnapshot =");
  let inspections=0;
  const body=new Element();
  const ctx={
    HTMLElement:Element,
    document:{body},
    focusables:()=>{inspections++;return [];},
    normaliseText:value=>String(value||"").trim(),
    rowContextFor:()=>({rowLabel:"",rowCardIndex:-1}),
    captureScroll:()=>({}),
  };
  vm.createContext(ctx);vm.runInContext(snippet+"\nglobalThis.save = snapshotFocus;",ctx);
  const control=new Element();
  const snapshot=ctx.save(control,body);
  assert.equal(snapshot.index,-1);
  assert.equal(inspections,0);
  const modal=new Element();
  ctx.save(control,modal);
  assert.equal(inspections,1,"Small modal scopes can still use positional focus fallback");
});

test("unrelated remote and keyboard keys return before expensive overlay and poster queries",()=>{
  const handler=between(remote,"    const onKeyDown = (event) => {","    window.addEventListener(\"keydown\", onKeyDown, true);");
  const early=handler.indexOf("if (!direction && !selectKey && !menuKey && !mediaAction) return;");
  const query=handler.indexOf("document.querySelector(");
  assert.ok(early>=0 && query>early);
  assert.match(handler,/const mediaAction = mediaActionFromEvent\(event\)/);
  assert.match(handler,/if \(!updateIsOpen &&\s+tapOnlyFlixForRemote/);
  assert.match(handler,/if \(mediaAction && runMediaAction\(mediaAction\)\)/);
});
