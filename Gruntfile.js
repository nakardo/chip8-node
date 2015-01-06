module.exports = function(grunt) {

  // configure grunt
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    jscs: {
      src: "lib/index.js"
    },

    jshint: {
      files: [
        '**/*.js',
        '!node_modules/**/*',
        '!browser/dist/**/*'
      ],
      options: {
        jshintrc: '.jshintrc'
      }
    },

    browserify: {
      standalone: {
        src: [ './lib/index.js' ],
        dest: './browser/dist/<%= pkg.name %>.standalone.js',
        options: {
          standalone: '<%= pkg.name %>'
        }
      },
    }
  });

  // Load plug-ins
  grunt.loadNpmTasks("grunt-jscs");
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-browserify');

  // define tasks
  grunt.registerTask('default', [
    'jscs', 'jshint', 'browserify'
  ]);
};
