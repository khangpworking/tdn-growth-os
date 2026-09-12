import { useRef, useState } from 'react';
import type { BasketMember, CandidateBasket, DecisionState, DemoState } from './model';
import { ownerB7Disabled, OwnerWriteError, submitOwnerB7AndReload } from './data-source';

export interface B7DecisionPanelProps {
  readonly mode: 'real'|'demo'; readonly workspaceId: string; readonly basket: CandidateBasket; readonly member: BasketMember;
  readonly ownerToken: string|null; readonly reloadReal:()=>Promise<DemoState>; readonly onSaved:()=>void;
  readonly onDemoDecision:(decision:DecisionState)=>void;
}
const labels={PASS:'Đạt',HOLD:'Tạm giữ',REJECT:'Loại'} as const;
const copy={PASS:'Ứng viên này đủ điều kiện để tạo một workspace sản phẩm riêng ở bước tiếp theo. Chưa có workspace nào được tạo.',HOLD:'Muốn xem xét lại, hãy tạo một phiên bản rổ cơ hội mới.',REJECT:'Quyết định này chỉ áp dụng cho đúng ứng viên và phiên bản trong rổ này.'} as const;
type Snapshot={basketId:string;candidateId:string;candidateVersion:number;decision:DecisionState};

export default function B7DecisionPanel({mode,workspaceId,basket,member,ownerToken,reloadReal,onSaved,onDemoDecision}:B7DecisionPanelProps){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null); const [confirm,setConfirm]=useState(false); const [pending,setPending]=useState(false); const [message,setMessage]=useState(''); const inFlight=useRef(false);
  if(member.b7State!=='NO_DECISION') return <div className="b7-result"><strong>{labels[member.b7State]}</strong><small>{copy[member.b7State]}</small><small>{member.b7DecidedAt} · ID …{member.b7DecisionId?.slice(-8)}</small></div>;
  const choose=(decision:DecisionState)=>{if(inFlight.current||pending)return;setSnapshot({basketId:basket.id,candidateId:member.candidateId,candidateVersion:member.candidateVersion,decision});setConfirm(true);setMessage('');};
  const send=async()=>{if(inFlight.current||pending||!snapshot)return;if(mode==='demo'){onDemoDecision(snapshot.decision);setConfirm(false);return;}if(!ownerToken)return;inFlight.current=true;setPending(true);setConfirm(false);setMessage('');try{const outcome=await submitOwnerB7AndReload({workspaceId,basketId:snapshot.basketId,candidateId:snapshot.candidateId,candidateVersion:snapshot.candidateVersion,decision:snapshot.decision,token:ownerToken},reloadReal);if(outcome.kind==='conflict')setMessage('Đã tải lại trạng thái B7 có thẩm quyền sau xung đột.');else onSaved();}catch(error){setMessage(error instanceof OwnerWriteError?error.message:'Không thể ghi quyết định B7.');}finally{inFlight.current=false;setPending(false);}};
  const disabled=mode==='real'?ownerB7Disabled({unlocked:ownerToken!==null,pending,complete:Boolean(member.candidateId&&member.candidateVersion),effective:member.b7State}):pending;
  return <div className="b7-panel"><div className="decision-actions" aria-label="Quyết định B7">{(['PASS','HOLD','REJECT'] as const).map(decision=><button type="button" className={decision.toLowerCase()} disabled={disabled} key={decision} onClick={()=>choose(decision)}>{labels[decision]}</button>)}</div>{message&&<p role="alert" className="snapshot-warning">{message}</p>}{confirm&&snapshot&&<div className="confirm-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="b7-confirm-title"><h3 id="b7-confirm-title">Xác nhận quyết định B7</h3><p><strong>{member.name} · phiên bản đóng băng v{snapshot.candidateVersion}</strong></p><p>Quyết định đã chọn: <strong>{snapshot.decision}</strong></p><p>Quyết định này được gắn vĩnh viễn với đúng phiên bản ứng viên trong rổ này và không thể sửa trực tiếp.</p><div className="confirm-actions"><button type="button" disabled={pending} onClick={()=>setConfirm(false)}>Hủy</button><button type="button" className="button primary" disabled={pending||(mode==='real'&&!ownerToken)} onClick={()=>void send()}>Xác nhận {snapshot.decision}</button></div></div></div>}</div>;
}
