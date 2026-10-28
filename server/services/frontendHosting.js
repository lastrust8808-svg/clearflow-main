import express from 'express';
import path from 'node:path';
import {existsSync} from 'node:fs';
export function mountFrontend(app, directory=path.resolve('dist')) {
 const index=path.join(directory,'index.html');
 if(!existsSync(index))throw new Error('Built frontend missing; run npm run build before enabling frontend hosting.');
 const serveStatic=express.static(directory,{index:false});
 app.use((req,res,next)=>{
  // Unknown API routes must never return a successful HTML shell.
  if(req.path==='/api'||req.path.startsWith('/api/')||req.path==='/health')return next();
  return serveStatic(req,res,next);
 });
 app.get('/{*path}',(req,res,next)=>{
  if(req.path==='/api'||req.path.startsWith('/api/')||req.path==='/health'||!req.accepts('html'))return next();
  // Missing assets should remain 404 instead of returning HTML as JavaScript.
  if(path.extname(req.path))return next();
  res.set('Cache-Control','no-store');return res.sendFile(index);
 });
}
