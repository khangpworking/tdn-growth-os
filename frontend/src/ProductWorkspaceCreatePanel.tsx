import { useRef, useState } from 'react';
import type { BasketMember, CandidateBasket, DemoState } from './model';
import { generatedProductWorkspaceKey, OwnerWriteError, submitOwnerProductWorkspaceAndReload } from './data-source';

interface Props {
  readonly mode:'real'|'demo'; readonly workspaceId:string; readonly basket:CandidateBasket; readonly member:BasketMember;
  readonly ownerToken:string|null; readonly reloadReal:()=>Promise<DemoState>; readonly onSaved:()=>void;
  readonly onDemoCreate:(snapshot:{productWorkspaceId:string;productWorkspaceKey:string;decisionId:string})=>void;
  readonly onOpen:(productWorkspaceId:string)=>void;
}
type Snapshot={workspaceId:string;basketId:string;candidateId:string;candidateVersion:number;decisionId:string;productWorkspaceKey:string};

export default function ProductWorkspaceCreatePanel({mode,workspaceId,basket,member,ownerToken,reloadReal,onSaved,onDemoCreate,onOpen}:Props){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null); const [confirm,setConfirm]=useState(false); const [pending,setPending]=useState(false); const [message,setMessage]=useState(''); const inFlight=useRef(false);
  if(member.productWorkspace) return <div className="b7-result"><strong>Đã tạo workspace sản phẩm</strong><small>{member.productWorkspace.title}</small><small>{member.productWorkspace.createdAt} · {member.productWorkspace.state} · bước vào {member.productWorkspace.entryStep}</small><button type="button" className="button quiet" onClick={()=>onOpen(member.productWorkspace!.id)}>Mở hồ sơ B8</button></div>;
  if(member.b7State!=='PASS'||!member.b7DecisionId)return null;
  const open=()=>{if(inFlight.current||pending||(mode==='real'&&!ownerToken))return;const value=snapshot??{workspaceId,basketId:basket.id,candidateId:member.candidateId,candidateVersion:member.candidateVersion,decisionId:member.b7DecisionId!,productWorkspaceKey:generatedProductWorkspaceKey()};setSnapshot(value);setConfirm(true);setMessage('');};
  const create=async()=>{if(inFlight.current||pending||!snapshot)return;if(mode==='demo'){inFlight.current=true;try{onDemoCreate({productWorkspaceId:`product-demo-${Date.now().toString(36)}`,productWorkspaceKey:snapshot.productWorkspaceKey,decisionId:snapshot.decisionId});setConfirm(false);}finally{inFlight.current=false;}return;}if(!ownerToken)return;inFlight.current=true;setPending(true);setConfirm(false);setMessage('');try{const outcome=await submitOwnerProductWorkspaceAndReload({...snapshot,token:ownerToken},reloadReal);if(outcome.kind==='conflict')setMessage('Đã tải lại dữ liệu có thẩm quyền sau xung đột.');else onSaved();}catch(error){setMessage(error instanceof OwnerWriteError?error.message:'Không thể tạo workspace sản phẩm.');}finally{inFlight.current=false;setPending(false);}};
  return <div className="b7-panel"><button type="button" className="button primary" disabled={pending||(mode==='real'&&!ownerToken)} onClick={open}>Tạo workspace sản phẩm</button>{message&&<p role="alert" className="snapshot-warning">{message}</p>}{confirm&&snapshot&&<div className="confirm-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="product-create-title"><h3 id="product-create-title">Tạo workspace sản phẩm riêng</h3><p><strong>{member.name} · phiên bản đóng băng v{snapshot.candidateVersion}</strong></p><p>Nguồn: exact B7 PASS · ID …{snapshot.decisionId.slice(-8)}</p><p>Thao tác này tạo một hồ sơ sản phẩm độc lập bắt đầu tại B8. Hệ thống chưa thực hiện bất kỳ quyết định B8 nào.</p><div className="confirm-actions"><button type="button" disabled={pending} onClick={()=>setConfirm(false)}>Hủy</button><button type="button" className="button primary" disabled={pending||(mode==='real'&&!ownerToken)} onClick={()=>void create()}>Tạo workspace sản phẩm</button></div></div></div>}</div>;
}
