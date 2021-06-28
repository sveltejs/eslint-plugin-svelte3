let foo;{let bar=0;(
foo
);(
bar
);}(
bar
);{let bar1=0,bar2=0;(
foo
);(
bar1
);(
bar2
);(
bar3
);}{let baz=0;(
baz
);}{let baz1=0,baz2=0;(
{ baz1, baz2 }
);(
baz1
);(
baz2
);(
baz3
);}{let blah2=0;(
blah2
);(
blah1
);(
blah2
);}(
foo
);{let blah1=0;(
blah1
);(
blah2
);}{let blah2=0;(
blah1
);(
blah2
);}(
foo
);{let bar=0;(
bar
);}{}