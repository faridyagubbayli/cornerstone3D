import babel from "@rollup/plugin-babel";
import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", { encoding: "utf8" }));

export default {
    external: ["dcmjs", "gl-matrix", "ndarray", "@cornerstonejs/tools"],
    input: pkg.src || "src/index.ts",
    output: [
        // {
        //   file: `dist/${pkg.name}.js`,
        //   format: "umd",
        //   name: pkg.name,
        //   sourcemap: true
        // },
        {
            file: `dist/adapters.es.js`,
            format: "es",
            sourcemap: true
        }
    ],
    plugins: [
        resolve({
            preferBuiltins: true,
            browser: true
        }),
        typescript({
            tsconfig: "./tsconfig.json"
        }),
        // globals(),
        // builtins(),
        babel({
            exclude: "node_modules/**",
            babelHelpers: "bundled"
        }),
        json()
    ]
};
