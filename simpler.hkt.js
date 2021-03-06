/**
 * This implementation uses the subtyping judgments from:
 * Formalization of a Polymorphic Subtyping Algorithm
 */

// util
const terr = msg => { throw new TypeError(msg) };
const id = x => x;
const compose = (f, g) => x => f(g(x));

// names
let _id = 0;
const freshId = () => _id++;
const resetId = () => { _id = 0 };

// types
const TCon = name => ({ tag: 'TCon', name });
const TVar = name => ({ tag: 'TVar', name });
const TMeta = () => ({ tag: 'TMeta', id: freshId(), type: null });
const TApp = (left, right) => ({ tag: 'TApp', left, right });
const TForall = (name, type) => ({ tag: 'TForall', name, type });

const tappFrom = ts => ts.reduce(TApp);
function tapp() { return tappFrom(Array.from(arguments)) }
const tforall = (tvs, type) =>
  tvs.length === 0 ? type :
  tvs.reduceRight((t, n) => TForall(n, t), type);

const TFunC = TCon('->');
const TFun = (left, right) => TApp(TApp(TFunC, left), right);
const isTFun = t =>
  t.tag === 'TApp' && t.left.tag === 'TApp' && t.left.left === TFunC;
const tfunL = t => t.left.right;
const tfunR = t => t.right;
const tfunFrom = ts => ts.reduceRight((x, y) => TFun(y, x));
function tfun() { return tfunFrom(Array.from(arguments)) }

const showTypeR = t => {
  if (t.tag === 'TCon') return t.name;
  if (t.tag === 'TVar') return t.name;
  if (t.tag === 'TMeta') return `?${t.id}`;
  if (isTFun(t))
    return `(${showTypeR(tfunL(t))} -> ${showTypeR(tfunR(t))})`;
  if (t.tag === 'TApp')
    return `(${showTypeR(t.left)} ${showTypeR(t.right)})`;
  if (t.tag === 'TForall')
    return `(∀${showTypeR(t.name)}. ${showTypeR(t.type)})`;
};

const prune = t => {
  if (t.tag === 'TMeta')
    return t.type ? (t.type = prune(t.type)) : t;
  if (t.tag === 'TApp')
    return TApp(prune(t.left), prune(t.right));
  if (t.tag === 'TForall')
    return TForall(t.name, prune(t.type));
  return t;
};
const showType = t => showTypeR(prune(t));

const substTVar = (x, s, t) => {
  if (x === t) return s;
  if (t.tag === 'TMeta' && t.type) return substTVar(x, s, t.type);
  if (t.tag === 'TApp')
    return TApp(substTVar(x, s, t.left), substTVar(x, s, t.right));
  if (t.tag === 'TForall')
    return t.name === x ? t : TForall(t.name, substTVar(x, s, t.type));
  return t;
};
const openTForall = (t, tf) => substTVar(tf.name, t, tf.type);

const hasTMeta = (x, t) => {
  if (x === t) return true;
  if (t.tag === 'TMeta' && t.type) return hasTMeta(x, t.type);
  if (t.tag === 'TApp')
    return hasTMeta(x, t.left) || hasTMeta(x, t.right);
  if (t.tag === 'TForall') return hasTMeta(x, t.type);
  return false;
};

const tmetas = (t, tms, res = []) => {
  if (t.tag === 'TMeta') {
    if (t.type) return tmetas(t.type, tms, res);
    if (tms.indexOf(t) >= 0 && res.indexOf(t) < 0) res.push(t);
    return res;
  }
  if (t.tag === 'TApp')
    return tmetas(t.right, tms, tmetas(t.left, tms, res));
  if (t.tag === 'TForall') return tmetas(t.type, tms, res);
  return res;
};

// dependency list
const Marker = () => ({ tag: 'Marker', id: freshId() });
const showElem = e => e.tag === 'Marker' ? `|>${e.id}` : showTypeR(e);

const deplist = [];
const remove = i => deplist.splice(i, 1);
const replace = (i, a) => deplist.splice(i, 1, ...a);
const indexOf = x => {
  for (let i = deplist.length - 1; i >= 0; i--)
    if (deplist[i] === x) return i;
  return -1;
};
const drop = m => deplist.splice(indexOf(m), deplist.length);

const showDeps = () => `[${deplist.map(showElem).join(', ')}]`;

// subsumption
const solve = (x, i, t) => {
  remove(i);
  x.type = t;
  return id;
};
const subsumeTMeta = (x, t, right) => {
  console.log(`subsumeTMeta ${right ? `${showTypeR(t)} =: ${showTypeR(x)}` : `${showTypeR(x)} := ${showTypeR(t)}`}`);
  if (x.type) return right ? subsume(t, x.type) : subsume(x.type, t);
  const i = indexOf(x);
  if (i < 0) return terr(`undefined tmeta ${showType(x)}`);
  if (x === t) return;
  if (t.tag === 'TMeta') {
    if (t.type) return subsumeTMeta(x, t.type, right);
    const j = indexOf(t);
    if (j < 0) return terr(`undefined tmeta ${showType(t)}`);
    return i > j ? solve(x, i, t) : solve(t, j, x);
  }
  if (t.tag === 'TCon') return solve(x, i, t);
  if (t.tag === 'TVar') {
    const j = indexOf(t);
    if (j < 0) return terr(`undefined tvar ${showType(t)}`);
    if (j > i)
      return terr(`tvar out of scope ${showType(x)} := ${showType(t)}`);
    return solve(x, i, t);
  }
  if (t.tag === 'TApp') {
    if (hasTMeta(x, t))
      return terr(`occurs check fail ${showType(x)} := ${showType(t)}`);
    const a = TMeta();
    const b = TMeta();
    replace(i, [a, b]);
    const ty = isTFun(t) ? TFun(a, b) : TApp(a, b);
    x.type = ty;
    return right ? subsume(t, ty) : subsume(ty, t);
  }
};
const subsume = (t1, t2) => {
  console.log(`subsume ${showTypeR(t1)} <: ${showTypeR(t2)} | ${showDeps()}`);
  if (t1.tag === 'TCon' && t2.tag === 'TCon' && t1 === t2) return id;
  if (t1.tag === 'TVar' && t2.tag === 'TVar' && t1 === t2) {
    if (indexOf(t1) < 0)
      return terr(`undefined tvar ${showType(t1)}`);
    return id;
  }
  if (isTFun(t1) && isTFun(t2)) {
    const f1 = subsume(tfunL(t2), tfunL(t1));
    const f2 = subsume(tfunR(t1), tfunR(t2));
    return compose(f2, f1);
  }
  if (t1.tag === 'TApp' && t2.tag === 'TApp') {
    const f1 = unify(t1.left, t2.left);
    const f2 = unify(t1.right, t2.right);
    return compose(f2, f1);
  }
  if (t2.tag === 'TForall') {
    const m = Marker();
    deplist.push(m, t2.name);
    const f = subsume(t1, t2.type);
    drop(m);
    return compose(t => FAbsT(t2.name, t), f);
  }
  if (t1.tag === 'TForall') {
    const tm = TMeta();
    deplist.push(tm);
    const f = subsume(openTForall(tm, t1), t2);
    return compose(t => FAppT(t, tm), f);
  }
  if (t1.tag === 'TMeta') return subsumeTMeta(t1, t2, false);
  if (t2.tag === 'TMeta') return subsumeTMeta(t2, t1, true);
  return terr(`cannot subsume ${showType(t1)} <: ${showType(t2)}`);
};
const unify = (t1, t2) => {
  const f1 = subsume(t1, t2);
  const f2 = subsume(t2, t1);
  return compose(f2, f1);
};

// local env
const Nil = { tag: 'Nil' };
const Cons = (head, tail) => ({ tag: 'Cons', head, tail });
const extend = (k, v, l) => Cons([k, v], l);
const lookup = (k, l) => {
  let c = l;
  while (c.tag === 'Cons') {
    const [k2, v] = c.head;
    if (k === k2) return v;
    c = c.tail;
  }
  return null;
};

const foldr = (f, i, l) =>
  l.tag === 'Cons' ? f(l.head, foldr(f, i, l.tail)) : i;

// wf
const wfType = t => {
  if (t.tag === 'TVar') {
    if (indexOf(t) < 0) return terr(`undefined tvar ${showType(t)}`);
    return;
  }
  if (t.tag === 'TMeta') {
    if (t.type) return wfType(t.type);
    if (indexOf(t) < 0) return terr(`undefined tmeta ${showType(t)}`);
    return;
  }
  if (t.tag === 'TApp') {
    wfType(t.left);
    wfType(t.right);
    return;
  }
  if (t.tag === 'TForall') {
    const m = Marker();
    deplist.push(m, t.name);
    wfType(t.type);
    drop(m);
    return;
  }
};

// ast
const Var = name => ({ tag: 'Var', name });
const Abs = (name, body) => ({ tag: 'Abs', name, body });
const App = (left, right) => ({ tag: 'App', left, right });
const Ann = (term, type) => ({ tag: 'Ann', term, type });
const AppT = (term, type1, type2) =>
  ({ tag: 'AppT', term, type1, type2 });

const abs = (ns, t) => ns.reduceRight((x, y) => Abs(y, x), t);
const appFrom = a => a.reduce(App);
function app() { return appFrom(Array.from(arguments)) }

const showTerm = t => {
  if (t.tag === 'Var') return t.name;
  if (t.tag === 'Abs') return `(λ${t.name} -> ${showTerm(t.body)})`;
  if (t.tag === 'App')
    return `(${showTerm(t.left)} ${showTerm(t.right)})`;
  if (t.tag === 'Ann')
    return `(${showTerm(t.term)} : ${showType(t.type)})`;
  if (t.tag === 'AppT')
    return `((${showTerm(t.term)} : ${showType(t.type1)}) @${showType(t.type2)})`;
};

// system f ast
const FVar = name => ({ tag: 'FVar', name });
const FAbs = (name, type, body) => ({ tag: 'FAbs', name, type, body });
const FApp = (left, right) => ({ tag: 'FApp', left, right });
const FAbsT = (name, body) => ({ tag: 'FAbsT', name, body });
const FAppT = (left, right) => ({ tag: 'FAppT', left, right });

const fabst = (ns, body) => ns.reduceRight((x, y) => FAbsT(y, x), body);

const showFTerm = t => {
  if (t.tag === 'FVar') return t.name;
  if (t.tag === 'FAbs')
    return `(λ(${t.name} : ${showType(t.type)}). ${showFTerm(t.body)})`;
  if (t.tag === 'FApp')
    return `(${showFTerm(t.left)} ${showFTerm(t.right)})`;
  if (t.tag === 'FAbsT')
    return `(Λ${showType(t.name)}. ${showFTerm(t.body)})`;
  if (t.tag === 'FAppT')
    return `(${showFTerm(t.left)} @${showType(t.right)})`;
};

const substFTVar = (x, s, t) => {
  if (t.tag === 'FAbs')
    return FAbs(t.name, substTVar(x, s, t.type), substFTVar(x, s, t.body));
  if (t.tag === 'FApp')
    return FApp(substFTVar(x, s, t.left), substFTVar(x, s, t.right));
  if (t.tag === 'FAbsT')
    return t.name === x ? t : FAbsT(t.name, substFTVar(x, s, t.body));
  if (t.tag === 'FAppT')
    return FAppT(substFTVar(x, s, t.left), substTVar(x, s, t.right));
  return t;
};

const pruneFTerm = t => {
  if (t.tag === 'FAbs')
    return FAbs(t.name, prune(t.type), pruneFTerm(t.body));
  if (t.tag === 'FApp')
    return FApp(pruneFTerm(t.left), pruneFTerm(t.right));
  if (t.tag === 'FAbsT')
    return FAbsT(t.name, pruneFTerm(t.body));
  if (t.tag === 'FAppT')
    return FAppT(pruneFTerm(t.left), prune(t.right));
  return t;
};

const simplifyFTerm = t => {
  if (t.tag === 'FAbs')
    return FAbs(t.name, t.type, simplifyFTerm(t.body));
  if (t.tag === 'FApp')
    return FApp(simplifyFTerm(t.left), simplifyFTerm(t.right));
  if (t.tag === 'FAbsT')
    return FAbsT(t.name, simplifyFTerm(t.body));
  if (t.tag === 'FAppT') {
    const l = simplifyFTerm(t.left);
    if (l.tag === 'FAbsT')
      return simplifyFTerm(substFTVar(l.name, t.right, l.body));
    return FAppT(l, t.right);
  }
  return t;
};

// inference
const generalize = (m, t) => {
  const dropped = drop(m);
  const tms = tmetas(t, dropped.filter(t => t.tag === 'TMeta'));
  const l = tms.length;
  const tvs = Array(l);
  for (let i = 0; i < l; i++) {
    const c = tms[i];
    const tv = TVar(`'${c.id}`);
    c.type = tv;
    tvs[i] = tv;
  }
  return [tvs, tforall(tvs, t)];
};

const infer = (genv, term) => {
  const m = Marker();
  deplist.push(m);
  const [ty, fterm] = synth(genv, Nil, term);
  const [tvs, ty2] = generalize(m, ty);
  return [prune(ty2), simplifyFTerm(fabst(tvs, pruneFTerm(fterm)))];
};

const synth = (genv, env, term) => {
  console.log(`synth ${showTerm(term)}`);
  if (term.tag === 'Var') {
    const t = lookup(term.name, env) || genv[term.name];
    if (!t) return terr(`undefined var ${term.name}`);
    return [t, FVar(term.name)];
  }
  if (term.tag === 'Ann') {
    wfType(term.type);
    const fterm = check(genv, env, term.term, term.type);
    return [term.type, fterm];
  }
  if (term.tag === 'App') {
    const [ty, ff] = synth(genv, env, term.left);
    const [ty2, extra, fa] = synthapp(genv, env, ty, term.right);
    return [ty2, FApp(foldr((x, y) => FAppT(y, x), ff, extra), fa)];
  }
  if (term.tag === 'Abs') {
    const a = TMeta();
    const b = TMeta();
    const m = Marker();
    deplist.push(m, a, b);
    const body = check(genv, extend(term.name, a, env), term.body, b);
    const [tvs, ty] = generalize(m, TFun(a, b));
    return [ty, fabst(tvs, FAbs(term.name, a, body))];
  }
  if (term.tag === 'AppT') {
    if (term.type1.tag !== 'TForall')
      return terr(`not a forall in ${showTerm(term.tag)}`);
    wfType(term.type1);
    wfType(term.type2);
    const body = check(genv, env, term.term, term.type1);
    return [
      openTForall(term.type2, term.type1),
      FAppT(body, term.type2),
    ];
  }
  return terr(`cannot synth ${showTerm(term)}`);
};
const check = (genv, env, term, type) => {
  console.log(`check ${showTerm(term)} : ${showType(type)}`);
  if (type.tag === 'TForall') {
    const m = Marker();
    deplist.push(m, type.name);
    const body = check(genv, env, term, type.type);
    drop(m);
    return FAbsT(type.name, body);
  }
  if (term.tag === 'Abs' && isTFun(type)) {
    const m = Marker();
    const body = check(genv, extend(term.name, tfunL(type), env),
      term.body, tfunR(type));
    drop(m);
    return FAbs(term.name, tfunL(type), body);
  }
  const [ty, body] = synth(genv, env, term);
  const f = subsume(ty, type);
  return f(body);
};
const synthapp = (genv, env, type, term) => {
  console.log(`synthapp ${showType(type)} @ ${showTerm(term)}`);
  if (type.tag === 'TForall') {
    const tm = TMeta();
    deplist.push(tm);
    const [ty, extra, fa] = synthapp(genv, env,
      openTForall(tm, type), term);
    return [ty, Cons(tm, extra), fa];
  }
  if (isTFun(type)) {
    const arg = check(genv, env, term, tfunL(type));
    return [tfunR(type), Nil, arg];
  }
  if (type.tag === 'TMeta') {
    if (type.type) return synthapp(genv, env, type.type, term);
    const i = indexOf(type);
    if (i < 0) return terr(`undefined tmeta ${showType(type)}`);
    const a = TMeta();
    const b = TMeta();
    replace(i, [b, a]);
    type.type = TFun(a, b);
    const body = check(genv, env, term, a);
    return [b, Nil, body];
  }
  return terr(`cannot synthapp ${showType(type)} @ ${showTerm(term)}`);
};

// testing
const tInt = TCon('Int');
const tList = TCon('List');
const tt = TVar('t');
const tr = TVar('r');
const v = Var;

const tid = TForall(tt, TFun(tt, tt));

const env = {
  zero: tInt,
  singleton: tforall([tt], tfun(tt, tapp(tList, tt))),
  nil: tforall([tt], tapp(tList, tt)),
  id: tid,
};

const term = abs(['x', 'y', 'z'], v('x'));
console.log(showTerm(term));
const [ty, fterm] = infer(env, term);
console.log(showTerm(term));
console.log(showType(ty));
console.log(showFTerm(fterm));

// fix order of generated type applications
