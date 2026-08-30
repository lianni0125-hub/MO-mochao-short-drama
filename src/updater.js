import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const REPOSITORY="lianni0125-hub/MO-mochao-short-drama";

export function detectInstallMode(root){
  if(fs.existsSync(path.join(root,".git")))return "git";
  if(fs.existsSync(path.join(root,"portable.json"))&&fs.existsSync(path.join(root,"runtime","node.exe")))return "portable";
  return "unsupported";
}

const safeWorkDir=(dataDir)=>{
  const resolved=path.resolve(dataDir,"system-update"),root=path.resolve(dataDir)+path.sep;
  if(!resolved.startsWith(root))throw new Error("更新暂存目录不安全");
  return resolved;
};

const downloadFile=async(url,target,onProgress)=>{
  const response=await fetch(url,{headers:{"User-Agent":"MO-mochao-short-drama-updater","Accept":"application/octet-stream"},redirect:"follow",signal:AbortSignal.timeout(15*60*1000)});
  if(!response.ok||!response.body)throw new Error(`更新文件下载失败：HTTP ${response.status}`);
  const total=Number(response.headers.get("content-length")||0);let received=0;
  const stream=Readable.fromWeb(response.body);stream.on("data",chunk=>{received+=chunk.length;if(total>0)onProgress?.(received,total);});
  await pipeline(stream,fs.createWriteStream(target,{flags:"wx"}));
};

const sha256=filePath=>new Promise((resolve,reject)=>{
  const hash=crypto.createHash("sha256"),stream=fs.createReadStream(filePath);stream.on("error",reject);stream.on("data",chunk=>hash.update(chunk));stream.on("end",()=>resolve(hash.digest("hex")));
});

const runPowerShell=(script,args,timeoutMs=5*60*1000)=>new Promise((resolve,reject)=>{
  const child=spawn("powershell.exe",["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",script,...args],{windowsHide:true,stdio:["ignore","pipe","pipe"]});let stderr="";
  child.stderr.on("data",chunk=>stderr=(stderr+chunk.toString()).slice(-3000));
  const timer=setTimeout(()=>{child.kill();reject(new Error("解压更新包超时"));},timeoutMs);
  child.on("error",error=>{clearTimeout(timer);reject(error);});
  child.on("close",code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`更新包解压失败${stderr?`：${stderr.slice(-500)}`:""}`));});
});

const releaseAssets=async version=>{
  const response=await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/tags/v${encodeURIComponent(version)}`,{headers:{"User-Agent":"MO-mochao-short-drama-updater","Accept":"application/vnd.github+json"},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(response.status===404?`GitHub Release v${version} 尚未提供便携安装包`:`无法读取 GitHub Release：HTTP ${response.status}`);
  const release=await response.json();return Array.isArray(release.assets)?release.assets:[];
};

const payloadRoot=directory=>{
  if(fs.existsSync(path.join(directory,"package.json")))return directory;
  const children=fs.readdirSync(directory,{withFileTypes:true}).filter(item=>item.isDirectory());
  if(children.length===1&&fs.existsSync(path.join(directory,children[0].name,"package.json")))return path.join(directory,children[0].name);
  throw new Error("便携更新包目录结构不正确");
};

export async function preparePortableUpdate({root,dataDir,latest,onProgress=()=>{}}){
  if(process.platform!=="win32")throw new Error("便携安装包自动更新目前仅支持 Windows；此环境请使用 Git 更新");
  const version=String(latest?.version||""),assetName=String(latest?.portableAsset||`MO-mochao-Windows-v${version}.zip`),checksumName=`${assetName}.sha256`;
  if(!/^\d+\.\d+\.\d+$/.test(version)||path.basename(assetName)!==assetName||!/^[A-Za-z0-9._-]+\.zip$/.test(assetName))throw new Error("便携更新清单包含不安全的版本或文件名");
  const assets=await releaseAssets(version);
  const archiveAsset=assets.find(asset=>asset.name===assetName),checksumAsset=assets.find(asset=>asset.name===checksumName);
  if(!archiveAsset||!checksumAsset)throw new Error(`Release v${version} 缺少 ${assetName} 或 SHA-256 校验文件`);
  const workDir=safeWorkDir(dataDir);fs.rmSync(workDir,{recursive:true,force:true});fs.mkdirSync(workDir,{recursive:true});
  const archive=path.join(workDir,assetName),checksumFile=path.join(workDir,checksumName),expanded=path.join(workDir,"expanded");
  onProgress(20,"正在下载 Windows 便携更新包");
  await downloadFile(archiveAsset.browser_download_url,archive,(received,total)=>onProgress(20+Math.floor(received/total*35),`正在下载更新包 ${Math.floor(received/total*100)}%`));
  await downloadFile(checksumAsset.browser_download_url,checksumFile);
  onProgress(58,"正在校验更新包完整性");
  const expected=fs.readFileSync(checksumFile,"utf8").match(/[a-f0-9]{64}/i)?.[0]?.toLowerCase();if(!expected)throw new Error("Release 校验文件格式不正确");
  const actual=await sha256(archive);if(actual!==expected)throw new Error("更新包 SHA-256 校验失败，已停止安装");
  fs.mkdirSync(expanded,{recursive:true});onProgress(66,"正在解压并验证新版程序");
  await runPowerShell(path.join(root,"scripts","expand-portable.ps1"),[archive,expanded]);
  const payload=payloadRoot(expanded),manifest=JSON.parse(fs.readFileSync(path.join(payload,"version.json"),"utf8")),portable=JSON.parse(fs.readFileSync(path.join(payload,"portable.json"),"utf8"));
  if(String(manifest.version)!==version||portable.format!=="mochao-windows-portable")throw new Error("更新包身份或版本验证失败");
  for(const required of ["src","public","scripts","runtime","node_modules","package.json"]){if(!fs.existsSync(path.join(payload,required)))throw new Error(`更新包缺少必要内容：${required}`);}
  onProgress(82,"正在创建安全替换与回滚任务");
  const helper=path.join(root,"scripts","portable-update.ps1"),log=path.join(workDir,"update.log"),child=spawn("powershell.exe",["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",helper,"-InstallDir",root,"-PayloadDir",payload,"-DataDir",dataDir,"-CurrentPid",String(process.pid),"-LogPath",log],{detached:true,windowsHide:true,stdio:"ignore"});
  await new Promise((resolve,reject)=>{child.once("spawn",resolve);child.once("error",reject);});child.unref();
  return {version,assetName,restartScheduled:true};
}
