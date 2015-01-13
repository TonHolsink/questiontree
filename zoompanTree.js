// Get JSON data
treeJSON = d3.json("zoompanTree.json", function(error, treeData) {
	// Calculate total nodes, max label length
	var totalNodes = 0;
	var maxLabelLength = 0;
	var maxTextLength = 30;
	var lineLength = 200;
	//Waarschijnlijk ben ik deze factor nog vergeten op plaatsen
	var vertspacingfactor = 1.8;
	var labelOffsX = "10";
	// var labelOffsY = ".35em";
	var labelOffsY = "-1";

	// panning variables
	var panSpeed = 200;
	// Misc. variables
	var i = 0;
	var duration = 750;
	var root;

	// size of the diagram
	var viewerWidth = $(window).width() - 50;
	var viewerHeight = $(window).height() - 50;

	var tree = d3.layout.tree()
		.size([viewerHeight, viewerWidth]);

	// define a d3 diagonal projection for use by the node paths later on.
	var diagonal = d3.svg.diagonal()
		.projection(function(d) {
			return [d.y, d.x * vertspacingfactor];
		});

	// A recursive helper function for performing some setup by walking through all nodes

	function visit(parent, visitFn, childrenFn) {
		if (!parent) return;

		visitFn(parent);

		var children = childrenFn(parent);
		if (children) {
			var count = children.length;
			for (var i = 0; i < count; i++) {
				visit(children[i], visitFn, childrenFn);
			}
		}
	}

	// Call visit function to establish maxLabelLength
	visit(treeData, function(d) {
		totalNodes++;
		maxLabelLength = Math.max(d.text.length, maxLabelLength);

	}, function(d) {
		return d.children && d.children.length > 0 ? d.children : null;
	});


	// sort the tree according to the node names

	function sortTree() {
		tree.sort(function(a, b) {
			return b.text.toLowerCase() < a.text.toLowerCase() ? 1 : -1;
		});
	}
	// Sort the tree initially incase the JSON isn't in a sorted order.
	// sortTree();

	// TODO: Pan function, can be better implemented.

	function pan(domNode, direction) {
		var speed = panSpeed;
		if (panTimer) {
			clearTimeout(panTimer);
			translateCoords = d3.transform(svgGroup.attr("transform"));
			if (direction == 'left' || direction == 'right') {
				translateX = direction == 'left' ? translateCoords.translate[0] + speed : translateCoords.translate[0] - speed;
				translateY = translateCoords.translate[1];
			} else if (direction == 'up' || direction == 'down') {
				translateX = translateCoords.translate[0];
				translateY = direction == 'up' ? translateCoords.translate[1] + speed : translateCoords.translate[1] - speed;
			}
			scaleX = translateCoords.scale[0];
			scaleY = translateCoords.scale[1];
			scale = zoomListener.scale();
			svgGroup.transition().attr("transform", "translate(" + translateX + "," + translateY + ")scale(" + scale + ")");
			d3.select(domNode).select('g.node').attr("transform", "translate(" + translateX + "," + translateY + ")");
			zoomListener.scale(zoomListener.scale());
			zoomListener.translate([translateX, translateY]);
			panTimer = setTimeout(function() {
				pan(domNode, speed, direction);
			}, 50);
		}
	}

	// Define the zoom function for the zoomable tree

	function zoom() {
		svgGroup.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
	}


	// define the zoomListener which calls the zoom function on the "zoom" event constrained within the scaleExtents
	var zoomListener = d3.behavior.zoom().scaleExtent([0.1, 3]).on("zoom", zoom);

	// define the baseSvg, attaching a class for styling and the zoomListener
	var baseSvg = d3.select("#tree-container").append("svg")
		.attr("width", viewerWidth)
		.attr("height", viewerHeight)
		.attr("class", "overlay")
		.attr("id", "overlay")
		.call(zoomListener);

	// Function to center node when clicked/dropped so node doesn't get lost when collapsing/moving with large amount of children.

	function centerNode(source) {
		scale = zoomListener.scale();
		// x = -source.y0;
		x = -source.y0;
		y = -source.x0;
		// x = x * scale + viewerWidth / 2;
		x = x * scale + lineLength;
		y = y * scale * vertspacingfactor + viewerHeight / 2;
		d3.select('g').transition()
			.duration(duration)
			.attr("transform", "translate(" + x + "," + y + ")scale(" + scale + ")");
		zoomListener.scale(scale);
		zoomListener.translate([x, y]);
	}

	function showDetails(d) {
		var txt = "";
		if (d.id.length > 0) {
			var det = details[d.id];
			txt = det.text;
			if (det.action.length > 0) {
				txt += "\n\nActies:\n";
				for (var i = 0; i < det.action.length; i++) {
					txt += det.action[i] + "\n";
				};
			}
		} else {
			txt = d.text;
		}
		// alert(txt);
	}

	function nodeText(d) {
		return  d.text.length > maxTextLength ? d.text.slice(0,maxTextLength) + '...' : d.text;
	}

	// Toggle children on click.

	function click(d) {
		if (d3.event.defaultPrevented) return; // click suppressed
		showDetails(d);
	}

	function update(source) {
		// Compute the new height, function counts total children of root node and sets tree height accordingly.
		// This prevents the layout looking squashed when new nodes are made visible or looking sparse when nodes are removed
		// This makes the layout more consistent.
		var levelWidth = [1];
		var childCount = function(level, n) {

			if (n.children && n.children.length > 0) {
				if (levelWidth.length <= level + 1) levelWidth.push(0);

				levelWidth[level + 1] += n.children.length;
				n.children.forEach(function(d) {
					childCount(level + 1, d);
				});
			}
		};
		childCount(0, root);
		var newHeight = d3.max(levelWidth) * 25; // 25 pixels per line
		tree = tree.size([newHeight, viewerWidth]);

		// Compute the new tree layout.
		var nodes = tree.nodes(root).reverse(),
			links = tree.links(nodes);

		// Set widths between levels based on maxLabelLength.
		nodes.forEach(function(d) {
			// d.y = (d.depth * (maxLabelLength * 10)); //maxLabelLength * 10px
			// alternatively to keep a fixed scale one can set a fixed depth per level
			// Normalize for fixed-depth by commenting out below line
			// d.y = (d.depth * 500); //500px per level.
			d.y = (d.depth * lineLength);
		});

		// Update the nodes...
		node = svgGroup.selectAll("g.node")
			.data(nodes, function(d) {
				return d.nodeId || (d.nodeId = ++i);
			});

		// Enter any new nodes at the parent's previous position.
		var nodeEnter = node.enter().append("g")
			.attr("class", "node")
			.attr("transform", function(d) {
				return "translate(" + source.y0 + "," + source.x0 * vertspacingfactor + ")";
			})
			.on('click', click)
			.on('mouseover', function(d) {
				// Walk parent chain
				var ancestors = [];
				var parent = d;
				while (!_.isUndefined(parent)) {
					ancestors.push(parent);
					parent = parent.parent;
				}

				// Get the matched links
				var matchedLinks = [];
				svgGroup.selectAll('path.link')
					.filter(function(d)
					{
						return _.any(ancestors, function(p)
						{
							return p === d.target;
						});
					}).classed("hover", true);
				svgGroup.selectAll('g.node')
					.filter(function(d)
					{
						return _.any(ancestors, function(p)
						{
							return p.nodeId === d.nodeId;
						});
					}).classed("hover", true);
			})
			.on('mouseout', function(d) {
				svgGroup.selectAll('.hover').classed('hover', false);
			});
		nodeEnter.append("circle")
			.attr('class', function(d) {return d.type == "Q" ? "nodeCircle" : d.type == "S" ? "nodeCircle set" : "nodeCircle answer"; })
			.attr("r", 0);
			// .style("fill", function(d) {
			// 	return d._children ? "lightsteelblue" : "#fff";
			// });

		nodeEnter.append("text")
			.attr("x", function(d) {
				return d.children || d._children ? -labelOffsX : labelOffsX;
			})
			.attr("dy", labelOffsY)
			.attr('class', 'nodeText')
			.attr("text-anchor", function(d) {
				return d.children || d._children ? "end" : "start";
			})
			.attr("title", function(d) {
				return d.text;
			})
			.text(function(d) {
				return d.text;
			})
			.style("fill-opacity", 0);

		// Update the text to reflect whether node has children or not.
		node.select('text')
			.attr("x", function(d) {
				return d.children || d._children ? -labelOffsX : labelOffsX;
			})
			.attr("text-anchor", function(d) {
				return d.children || d._children ? "end" : "start";
			})
			.text(function(d) {
				return nodeText(d);
			});

		// Change the circle fill depending on whether it has children and is collapsed
		node.select("circle.nodeCircle")
			.attr("r", 4.5);
			// .style("fill", function(d) {
			// 	return d._children ? "lightsteelblue" : "#fff";
			// });

		// Transition nodes to their new position.
		var nodeUpdate = node.transition()
			.duration(duration)
			.attr("transform", function(d) {
				return "translate(" + d.y + "," + d.x * vertspacingfactor + ")";
			});

		// Fade the text in
		nodeUpdate.select("text")
			.style("fill-opacity", 1);

		// Transition exiting nodes to the parent's new position.
		var nodeExit = node.exit().transition()
			.duration(duration)
			.attr("transform", function(d) {
				return "translate(" + source.y + "," + source.x * vertspacingfactor + ")";
			})
			.remove();

		nodeExit.select("circle")
			.attr("r", 0);

		nodeExit.select("text")
			.style("fill-opacity", 0);

		// Update the links...
		var link = svgGroup.selectAll("path.link")
			.data(links, function(d) {
				return d.target.nodeId;
			});

		// Enter any new links at the parent's previous position.
		link.enter().insert("path", "g")
			.attr("class", "link")
			.attr("d", function(d) {
				var o = {
					x: source.x0,
					y: source.y0
				};
				return diagonal({
					source: o,
					target: o
				});
			});

		// Transition links to their new position.
		link.transition()
			.duration(duration)
			.attr("d", diagonal);

		// Transition exiting nodes to the parent's new position.
		link.exit().transition()
			.duration(duration)
			.attr("d", function(d) {
				var o = {
					x: source.x,
					y: source.y
				};
				return diagonal({
					source: o,
					target: o
				});
			})
			.remove();

		// Stash the old positions for transition.
		nodes.forEach(function(d) {
			d.x0 = d.x;
			d.y0 = d.y;
		});
	}

	// Append a group which holds all nodes and which the zoom Listener can act upon.
	var svgGroup = baseSvg.append("g");

	// Define the root
	root = treeData;
	root.x0 = viewerHeight / 2;
	root.y0 = 0;

	// Layout the tree initially and center on the root node.
	update(root);
	centerNode(root);

	$('g.node').each(function() {
		$(this).qtip({
			content: {
				text: "Hallo allemaal",
				button: true
			},
			position: {
				my: 'bottom left',
				target: 'mouse',
				adjust: {
					mouse: false
				},
				viewport: $(window)
			},
			show: {
				solo: true,
				event: click
			},
			hide: {
				event: click
			},
			style: {
				classes: 'qtip-bootstrap qtip-shadow'
			}
		});
	});

	// Mock details
	var details = [
		{
			text: "Naw gegevens",
			action: ["Stuur een bos bloemen"]
		},
		{
			text: "Wat is de klacht",
			action: []
		},
		{
			text: "Kraan lekt",
			action: ["Bel de monteur"]
		},
		{
			text: "Verwarming stuk",
			action: ["Bel de monteur"]
		},
		{
			text: "Lamp kapot",
			action: ["Koop een nieuwe"]
		},
		{
			text: "Dak lekt",
			action: ["Bel de dakreparateur"]
		},
		{
			text: "Fa. Stoker",
			action: ["Bel de firma Stoker"]
		},
		{
			text: "Fa. Brander",
			action: ["Bel de firma Brander"]
		},
		{
			text: "Ja",
			action: ["Ontlucht de radiator"]
		}
	]
});