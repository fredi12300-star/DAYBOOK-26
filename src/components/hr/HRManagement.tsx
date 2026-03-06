import React from 'react';
import { Users, CalendarDays, LogOut, Calculator, Clock, Search, UserPlus, GraduationCap, Target, BookOpen, FolderOpen, AlertTriangle, BarChart3, Settings } from 'lucide-react';

interface HRModuleCardProps {
    icon: React.ElementType;
    title: string;
    description: string;
    comingSoon?: boolean;
}

function HRModuleCard({ icon: Icon, title, description, comingSoon = true }: HRModuleCardProps) {
    return (
        <div className="surface-card p-6 border border-slate-800/10 flex flex-col gap-4 group hover:shadow-glow hover:shadow-brand-500/5 transition-all">
            <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20">
                    <Icon className="w-5 h-5" />
                </div>
                {comingSoon && (
                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 bg-slate-800 text-slate-500 rounded-lg border border-slate-700/50">
                        Coming Soon
                    </span>
                )}
            </div>
            <div>
                <h3 className="text-sm font-display font-black text-white uppercase tracking-tight">{title}</h3>
                <p className="text-[11px] text-slate-500 mt-1 font-medium leading-relaxed">{description}</p>
            </div>
        </div>
    );
}

const HR_MODULES = [
    { icon: Users, title: 'Staff Directory', description: 'Employee profiles, org chart, employment status and document links.' },
    { icon: CalendarDays, title: 'Leave Management', description: 'Leave types, accrual rules, approval workflows and balance tracking.' },
    { icon: Clock, title: 'Attendance Management', description: 'Time tracking, overtime rules and attendance verification.', comingSoon: false },
    { icon: LogOut, title: 'Relieving & Exit', description: 'Resignation tracking, exit checklists, F&F settlement and relieving letters.', comingSoon: false },
    { icon: Calculator, title: 'Payroll', description: 'Salary structures, statutory compliance, payslip generation and payroll locks.', comingSoon: false },
    { icon: Search, title: 'Recruitment', description: 'Requisition flow, candidate pipeline, interview scheduling and offer tracking.' },
    { icon: UserPlus, title: 'Onboarding', description: 'Pre-joining documents, joining checklists, probation goals and buddy tasks.' },
    { icon: Target, title: 'Performance Management', description: 'Goal setting, mid-year and annual reviews, ratings and increment recommendations.' },
    { icon: GraduationCap, title: 'Training & Development', description: 'Skill matrix, training calendar, compliance tracking and certification alerts.' },
    { icon: FolderOpen, title: 'Employee Documents', description: 'Central repository with expiry reminders, templates and version control.' },
    { icon: AlertTriangle, title: 'Grievance & Discipline', description: 'Confidential case logging, investigation workflow and escalation matrix.' },
    { icon: BarChart3, title: 'Reports & Analytics', description: 'Headcount, attrition, payroll cost, hiring funnel and compliance dashboards.' },
    { icon: Settings, title: 'HR Settings', description: 'Leave policies, holiday calendars, pay grades, approval chains and org master data.' },
];

export default function HRManagement() {
    return (
        <div className="space-y-12 pb-10">
            {/* Header */}
            <div className="flex flex-col gap-4 px-1">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[1.5rem] bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20 shadow-glow shadow-brand-500/5">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-display font-black text-white uppercase tracking-tight leading-none">
                            HR Management
                        </h1>
                        <p className="text-slate-500 font-medium text-sm mt-1">
                            Full-cycle human resource operations — from hire to retire.
                        </p>
                    </div>
                </div>

                {/* Coming Soon Banner */}
                <div className="mt-2 p-6 bg-brand-500/5 border border-brand-500/10 rounded-[2rem] flex items-center gap-6">
                    <div className="w-10 h-10 rounded-2xl bg-brand-500/10 flex items-center justify-center shrink-0">
                        <BookOpen className="w-5 h-5 text-brand-500" />
                    </div>
                    <div>
                        <p className="text-[11px] font-black text-brand-400 uppercase tracking-widest">Module Under Construction</p>
                        <p className="text-[12px] text-slate-400 mt-0.5 font-medium">
                            The HR suite is being built. All 13 sub-modules below are planned and permissions are already configurable in Terminal Config.
                        </p>
                    </div>
                </div>
            </div>

            {/* Module Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {HR_MODULES.map((mod) => (
                    <HRModuleCard key={mod.title} {...mod} />
                ))}
            </div>
        </div>
    );
}
