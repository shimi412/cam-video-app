"use client";
import {Suspense} from "react";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {WorkProgress} from "@/components/work-progress";
import {ComicStartForm,filmCategory} from "@/components/comic-start-form";
function Screen(){const category=filmCategory(useSearchParams().get("category"));return <div className="max-w-3xl mx-auto space-y-6"><Link href="/" className="btn btn-ghost btn-sm">← Video categories</Link><ComicStartForm category={category}/></div>;}
export default function ComicStart(){return <Suspense fallback={<WorkProgress title="Opening" description="Loading the creation screen."/>}><Screen/></Suspense>;}
