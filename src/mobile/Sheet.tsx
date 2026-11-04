import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export default function Sheet({ title, children, onClose }: {title:string;children:ReactNode;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[]);
  return <dialog className="mobile-sheet" ref={ref} aria-label={title} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="mobile-sheet-body"><div className="mobile-sheet-heading"><h2>{title}</h2><button type="button" className="mobile-icon" aria-label="关闭" onClick={onClose}><X size={22}/></button></div>{children}</div>
  </dialog>;
}
