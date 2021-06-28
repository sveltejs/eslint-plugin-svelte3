<script>
  let trapFocus;
  let fullWidth;
  let keepTitleCase;
  let breadcrumbLink;
  let breadcrumbLabel;
  let title = '';
  let wrapFocus;

  function a() {
    return 1 + 2;
  }
</script>


<header class="page-header" class:full-width={fullWidth}>
  <slot />

  <div class="title">
    <h2 class:keep-title-case={keepTitleCase}>
      {#if breadcrumbLink}
        <a href={breadcrumbLink} class="breadcrumb">{breadcrumbLabel}</a>
      {/if}
      {title}
    </h2>
    <h1 data-error-out="1"></h1>
  </div>
</header>
<div class="trapFocus" on:keydown={wrapFocus}>
  <slot />
</div>
<a on:click transition:trapFocus target="_blank" />
