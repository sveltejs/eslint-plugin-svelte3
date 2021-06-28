(<>

<each>
{bar}
</each>

{bar}

<each>
{bar1}
	{bar2}
	{bar3}
</each>

<Component data-let-baz>
	{baz}
</Component>

<Component data-let-baz>
	{baz1}
	{baz2}
	{baz3}
</Component>

<Component2>
	<div slot='foo' data-let-blah>
		{blah1}
		{blah2}
	</div>
</Component2>

<await>
	xxx
<then>
	{blah1}
	{blah2}
</then><catch>
	{blah1}
	{blah2}
</catch></await>

<await><then>
	{bar}
</then><catch></catch></await></>);