import {useRef,useState} from 'react';
import {apiRequest,queryClient} from '@/lib/queryClient';
import './roastery-shipping.css';
export default function RoasteryLogin(){
 const [username,setUsername]=useState('클라리멘토'),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
 async function submit(e:React.FormEvent){e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
  const r=await apiRequest('POST','/api/auth/login',{businessName:username.trim(),password,rememberMe:false,expectedRole:'roastery'});
  const user=await r.json();if(user.role!=='roastery')throw Error('로스터리 전용 계정이 필요합니다.');
  queryClient.clear();queryClient.setQueryData(['/api/auth/me'],user);setPassword('');
 }catch(e:any){setError(e.message||'로그인하지 못했습니다.');}finally{lock.current=false;setBusy(false);}}
 return <main className="roastery"><h1>클라리멘토 송장 입력</h1><p>이 주소를 즐겨찾기에 저장해 계속 이용하세요. 클라리멘토 전용 아이디로 로그인합니다.</p><form className="ship-panel ship-fields" onSubmit={submit}><label>아이디<input type="text" autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)}/></label><label>비밀번호<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>{busy?'로그인 중…':'로그인'}</button></form>{error&&<p role="alert">{error}</p>}<p>비밀번호 변경이 필요하거나 접근이 중지된 경우 니트커피 담당자에게 문의해 주세요. 비밀번호는 브라우저에 별도로 저장하지 않습니다.</p></main>;
}
