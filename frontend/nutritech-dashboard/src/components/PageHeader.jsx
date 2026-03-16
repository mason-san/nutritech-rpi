/**
 * REUSABLE COMPONENT: PageHeader
 * Provides a consistent title, subtitle, and optional right-side buttons/actions 
 * (like Refresh) for all pages in the dashboard.
 * @param {string} title - The main heading of the page.
 * @param {string} subtitle - Explanatory text below the title.
 * @param {ReactNode} rightContent - Optional buttons or status indicators.
 */
function PageHeader({title, subtitle, rightContent}) {
    return(
        <div className="flex justify-between items-end mb-10">
            <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">{title}</h1>
                <p className="text-slate-400 mt-2">{subtitle}</p>
            </div>

            {rightContent && (
                <div>
                    {rightContent}
                </div>
            )}
        </div>
    );
}

export default PageHeader;