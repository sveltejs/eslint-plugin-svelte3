(<>


2
<svelte:head>
  <div>head</div>
</svelte:head>
3
<h1 data-error-out></h1>
<if>
  <div>0</div>
</if>
<each>
  <div>each</div>
  </each>
4



5

<await>
  <div>pending</div>
  <then>
  <div>then</div>
  </then><catch>
  <div>catch</div>
  </catch></await>
<svelte:component>
  <div>component</div>
</svelte:component>
<if>
<svelte:self>
  <div>self</div>
</svelte:self>

  </if>


6



7

  <div>options</div>


8</>);