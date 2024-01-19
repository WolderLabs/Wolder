using DeGA.Core.Scopes.FileSystem;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Generator.CSharp
{
    public static class FolderScopeExtensions
    {
        public static FolderScope AddProjectFile(
            this FolderScope scope, string name, string projectTypePrompt, string? additionalRequirements = null)
        {
            return scope;
        }
    }
}
