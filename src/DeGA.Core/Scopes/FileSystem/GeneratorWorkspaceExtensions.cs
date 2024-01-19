using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core.Scopes.FileSystem
{
    public static class GeneratorWorkspaceExtensions
    {
        public static Generator<FolderScope> InRootDirectory(this GeneratorWorkspace workspace)
        {
            return new Generator<FolderScope>(new FolderScope());
        }

        public static Generator<FolderScope> InDirectory(this GeneratorWorkspace workspace, string relativePath)
        {
            return new Generator<FolderScope>(new FolderScope());
        }
    }
}
