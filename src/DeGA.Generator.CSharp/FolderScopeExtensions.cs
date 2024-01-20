using DeGA.Core.Scopes.FileSystem;
using DeGA.Generator.CSharp.Compilation;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Generator.CSharp
{
    public static class FolderScopeExtensions
    {
        public static DotNetProjectScope AddProjectFile(
            this FolderScope scope, string name, string projectTypePrompt, string? additionalRequirements = null)
        {
            return new DotNetProjectScope();
        }
        
        public static DotNetProjectScope InProject(this FolderScope scope, string name)
        {
            return new DotNetProjectScope();
        }
    }
}
