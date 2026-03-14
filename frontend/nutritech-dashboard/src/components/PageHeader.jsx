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