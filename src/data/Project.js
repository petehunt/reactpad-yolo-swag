// Utils

function pull(arr, key) {
  var obj = {};
  arr.forEach(function(item) {
    obj[item[key]] = item;
  });
  return obj;
}

function keyOf(x) {
  return Object.keys(x)[0];
}

function sprintf(template) {
  Array.prototype.slice.call(arguments).slice(1).forEach(function(arg) {
    template = template.replace('%s', arg);
  });
  return template;
}

function invariant(condition, message /* ... */) {
  if (!condition) {
    throw new Error('Invariant Violation: ' + sprintf.apply(this, Array.prototype.slice.call(arguments).slice(1)));
  }
}

// Data types (mostly-immutable structs)

function GraphEdge(label, fromKey, toKey, data, order) {
  this.label = label;
  this.fromKey = fromKey;
  this.toKey = toKey;
  this.data = data;
  this.order = order;
}

function GraphNode(type, key, content) {
  this.type = type;
  this.key = key;
  this.content = content;
}

function GraphNodeSpec(type) {
  this.type = type;
}

function GraphEdgeSpec(label, fromType, toType, bidirectional, inverseLabel, unique) {
  this.label = label;
  this.fromType = fromType;
  this.toType = toType;
  this.bidirectional = bidirectional;
  this.inverseLabel = inverseLabel;
  this.unique = unique;
}

function Graph(nodeSpecs, edgeSpecs, nodes, edges) {
  this.nodeSpecs = pull(nodeSpecs, keyOf({type: null}));
  this.edgeSpecs = pull(edgeSpecs, keyOf({label: null}));
  this.nodes = nodes || {}; // key -> GraphNode
  this.edges = edges || {}; // label -> fromKey -> ordered (toKey -> GraphEdge)
}

// Mutators

Graph.prototype.addNode = function(type, key, content) {
  invariant(!this.nodes[key], 'Node with key %s already exists!', key);

  var node = new GraphNode(type, key, content);
  this.nodes[key] = node;
  return node;
};

Graph.prototype.removeNode = function(key) {
  invariant(this.nodes[key], 'Node with key %s does not exist!', key);
  delete this.nodes[key];

  // Delete edges (both directions) from this node
  for (var label in this.edgeSpecs) {
    var labelEdges = this.edges[label];
    if (labelEdges) {
      var edgesFromNode = labelEdges[key];
      if (edgesFromNode) {
        for (var toKey in edgesFromNode) {
          var edge = edgesFromNode[toKey];
          this.removeEdge(edge.label, edge.fromKey, edge.toKey);
        }

        // Clean up the container (not really needed but w/e
        delete labelEdges[key];
      }
    }
  }
};

Graph.prototype.addEdge = function(label, fromKey, toKey, data, order) {
  var spec = this.edgeSpecs[label];

  invariant(spec, 'Could not find edge spec for %s', label);
  invariant(
    !this.getEdge(label, fromKey, toKey),
    'Edge of label %s between %s and %s exists', label, fromKey, toKey
  );
  invariant(
    !spec.inverseLabel || (!this.getEdge(spec.inverseLabel, toKey, fromKey)),
    'Inverse edge of label %s between %s and %s exists', spec.inverseLabel, toKey, fromKey
  );

  this._insertEdge(new GraphEdge(label, fromKey, toKey, data, order));
  if (spec.inverseLabel) {
    this._insertEdge(new GraphEdge(spec.inverseLabel, toKey, fromKey, data, order));
  }
};

Graph.prototype._insertEdge = function(edge) {
  // All invariants are already checked.

  var edgesOfType = this.edges[edge.label];
  if (!edgesOfType) {
    this.edges[edge.label] = edgesOfType = {};
  }

  var edgesOfTypeFromKey = edgesOfType[edge.fromKey];
  if (!edgesOfTypeFromKey) {
    edgesOfType[edge.fromKey] = edgesOfTypeFromKey = {};
  }

  var newEdgesOfTypeFromKey = {};
  var inserted = false;

  for (var toKey in edgesOfTypeFromKey) {
    var existingEdge = edgesOfTypeFromKey[toKey];
    if (!inserted && existingEdge.order > edge.order) {
      // Insert before existingEdge
      newEdgesOfTypeFromKey[edge.toKey] = edge;
      inserted = true;
    }
    newEdgesOfTypeFromKey[toKey] = existingEdge;
  }

  if (!inserted) {
    newEdgesOfTypeFromKey[edge.toKey] = edge;
  }

  edgesOfType[edge.fromKey] = newEdgesOfTypeFromKey;
};

Graph.prototype._deleteEdge = function(label, fromKey, toKey) {
  var edgesOfType = this.edges[label];
  invariant(edgesOfType, 'Could not find edge %s between %s and %s', label, fromKey, toKey);

  var edgesOfTypeFromKey = edgesOfType[fromKey];
  invariant(edgesOfTypeFromKey, 'Could not find edge %s between %s and %s', label, fromKey, toKey);
  invariant(edgesOfTypeFromKey[toKey], 'Could not find edge %s between %s and %s', label, fromKey, toKey);

  delete edgesOfTypeFromKey[toKey];
};

Graph.prototype.removeEdge = function(label, fromKey, toKey) {
  var spec = this.edgeSpecs[label];

  invariant(spec, 'Could not find edge spec for %s', label);

  this._deleteEdge(label, fromKey, toKey);

  if (spec.inverseLabel) {
    this._deleteEdge(spec.inverseLabel, toey, fromKey);
  }
};

var SAVE_INTERVAL = 2000;

function getComponentTemplate(name) {
  return {
    js: 'var Main = React.createClass({\n  render: function() {\n    return <div className="Main">Hello world</div>;\n  }\n});'.replace(/Main/g, name),
    css: '.Main {\n  color: blue;\n}'.replace('Main', name),
    example: 'examples.push(<Main />);'.replace('Main', name)
  };
}

var Project = function(name, components) {
  this.name = name;
  this.components = components || {
    Main: getComponentTemplate('Main')
  };
  this.autosaveCallbacks = [];
  window.setInterval(this.save.bind(this), SAVE_INTERVAL);
};

Project.prototype.autosave = function(cb) {
  this.autosaveCallbacks.push(cb);
};

Project.prototype.unautosave = function(cb) {
  var i = this.autosaveCallbacks.indexOf(cb);
  if (i === -1) {
    return;
  }
  this.autosaveCallbacks.splice(i, 1);
};


Project.prototype.createComponent = function(name) {
  this.components[name] = getComponentTemplate(name);
};

Project.prototype.updateComponent = function(name, js, css, example) {
  this.components[name] = {js: js, css: css, example: example};
};

Project.prototype.save = function() {
  window.localStorage.setItem('project_' + this.name, JSON.stringify(this.components));
  this.autosaveCallbacks.forEach(function(cb) { cb(); });
};

Project.get = function(name) {
  var json = window.localStorage.getItem('project_' + name);
  return new Project(name, JSON.parse(json));
};

module.exports = Project;