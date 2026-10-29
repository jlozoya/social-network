export function ContentLoading({ title }: { title?: string }) {
  return (
    <section className="content-loading" aria-busy="true" aria-label="Cargando contenido">
      {title && (
        <div className="section-title">
          <h2>{title}</h2>
        </div>
      )}
      <p className="loading-caption" role="status">
        <span className="loading-dot" aria-hidden="true" />
        Cargando contenido…
      </p>
      <div aria-hidden="true">
        {[0, 1].map((index) => (
          <div className="card loading-post" key={index}>
            <div className="loading-person">
              <span className="skeleton-shape skeleton-avatar" />
              <div className="loading-lines">
                <span className="skeleton-shape skeleton-name" />
                <span className="skeleton-shape skeleton-detail" />
              </div>
            </div>
            <div className="loading-post-body">
              <span className="skeleton-shape skeleton-line" />
              <span className="skeleton-shape skeleton-line-short" />
            </div>
            {index === 0 && <div className="skeleton-shape skeleton-media" />}
            <div className="loading-post-footer">
              <span className="skeleton-shape skeleton-action" />
              <span className="skeleton-shape skeleton-action" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PeopleLoading() {
  return (
    <div className="loading-people" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div className="loading-person" key={index}>
          <span className="skeleton-shape skeleton-avatar" />
          <div className="loading-lines">
            <span className="skeleton-shape skeleton-name" />
            <span className="skeleton-shape skeleton-detail" />
          </div>
        </div>
      ))}
    </div>
  );
}
