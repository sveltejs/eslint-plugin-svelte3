(<>


<header class="page-header" data-class-full-width={fullWidth='',fullWidth}>
  <slot />

  <div class="title">
    <h2 data-class-keep-title-case={keepTitleCase='',keepTitleCase}>
      <if>
<a href={breadcrumbLink} class="breadcrumb">{breadcrumbLabel}</a>
</if>
      {title}
    </h2>
    <h1 data-error-out="1"></h1>
  </div>
</header>
<div class="trapFocus" onKeydown={wrapFocus}>
  <slot />
</div>
<a onClick data-transition-trapFocus target="_blank"></a></>);